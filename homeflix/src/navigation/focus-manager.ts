import type { Direction } from '../platform/keys';

/**
 * Gerenciador de foco para controle remoto.
 *
 * Modelo declarativo (não depende de medidas de layout, então é previsível e testável):
 * - Grupos: elementos com `data-focus-group="id"` e `data-orientation`
 *   ("horizontal" | "vertical" | "grid", com `data-columns="n"` no grid).
 * - Itens: elementos com `data-focusable` dentro do grupo (`data-disabled` os ignora).
 *   `data-key` identifica o item para restaurar o foco mesmo se a lista mudar de ordem.
 * - Vizinhos: `data-nav-up|down|left|right="idDoGrupo"`. Sem isso, cima/baixo
 *   seguem a ordem dos grupos no documento (como as fileiras da tela inicial).
 * - Cada grupo lembra o último item focado (voltar à fileira volta ao mesmo card).
 * - Camadas: diálogos e menus empilham uma camada; só ela recebe foco.
 * - Rolagem: ancestrais com `data-scroll-x`/`data-scroll-y` ("start" ou "nearest")
 *   rolam para manter o item visível.
 */

export interface FocusSnapshot {
  readonly groupId: string;
  readonly index: number;
  readonly key: string | null;
}

export type FocusListener = (element: HTMLElement, group: HTMLElement | null) => void;

const FOCUSED_CLASS = 'is-focused';
const ACTIVE_GROUP_CLASS = 'has-focus';

export class FocusManager {
  private layers: HTMLElement[] = [];
  private currentElement: HTMLElement | null = null;
  private readonly memory = new WeakMap<HTMLElement, number>();
  private readonly listeners = new Set<FocusListener>();

  /** Define a raiz da tela atual (descarta camadas abertas da tela anterior). */
  setRoot(root: HTMLElement): void {
    this.layers = [root];
    this.currentElement = null;
  }

  pushLayer(layer: HTMLElement): void {
    this.layers.push(layer);
  }

  /** Remove a camada e devolve o foco ao elemento que estava focado antes dela. */
  popLayer(layer: HTMLElement, restoreTo?: HTMLElement | null): void {
    this.layers = this.layers.filter((item) => item !== layer);
    if (restoreTo && this.activeLayer()?.contains(restoreTo)) this.focus(restoreTo);
    else if (this.currentElement && !this.activeLayer()?.contains(this.currentElement)) this.focusFirst();
  }

  onFocus(listener: FocusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  current(): HTMLElement | null {
    return this.currentElement && this.currentElement.isConnected ? this.currentElement : null;
  }

  activeLayer(): HTMLElement | null {
    return this.layers.at(-1) ?? null;
  }

  focus(element: HTMLElement): void {
    const previous = this.currentElement;
    if (previous && previous !== element) {
      previous.classList.remove(FOCUSED_CLASS);
      groupOf(previous)?.classList.remove(ACTIVE_GROUP_CLASS);
    }

    this.currentElement = element;
    element.classList.add(FOCUSED_CLASS);
    const group = groupOf(element);
    if (group) {
      group.classList.add(ACTIVE_GROUP_CLASS);
      const index = itemsOf(group).indexOf(element);
      if (index >= 0) this.memory.set(group, index);
    }
    scrollIntoView(element);
    for (const listener of this.listeners) listener(element, group);
  }

  /** Foca o primeiro item disponível da camada ativa (ou de um grupo específico). */
  focusFirst(groupId?: string): boolean {
    const layer = this.activeLayer();
    if (!layer) return false;
    const groups = groupId ? [findGroup(layer, groupId)].filter(isElement) : groupsOf(layer);
    for (const group of groups) {
      if (this.enterGroup(group, null)) return true;
    }
    const loose = layer.querySelector<HTMLElement>('[data-focusable]:not([data-disabled])');
    if (loose) {
      this.focus(loose);
      return true;
    }
    return false;
  }

  /** Move o foco; retorna false quando não há para onde ir (a tela pode tratar a tecla). */
  move(direction: Direction): boolean {
    const layer = this.activeLayer();
    const current = this.current();
    if (!layer) return false;
    if (!current || !layer.contains(current)) return this.focusFirst();

    const group = groupOf(current);
    if (!group || !layer.contains(group)) return false;

    const items = itemsOf(group);
    const index = items.indexOf(current);
    const target = stepWithin(group, items, index, direction);
    if (target) {
      this.focus(target);
      return true;
    }

    let next = neighborGroup(layer, group, direction);
    const visited = new Set<HTMLElement>([group]);
    while (next && !visited.has(next)) {
      visited.add(next);
      if (this.enterGroup(next, current)) return true;
      next = neighborGroup(layer, next, direction);
    }
    return false;
  }

  snapshot(): FocusSnapshot | null {
    const current = this.current();
    const group = current ? groupOf(current) : null;
    if (!current || !group) return null;
    return {
      groupId: group.dataset['focusGroup'] ?? '',
      index: itemsOf(group).indexOf(current),
      key: current.dataset['key'] ?? null,
    };
  }

  /** Restaura o foco: primeiro pelo `data-key`, depois pelo índice no grupo. */
  restore(snapshot: FocusSnapshot | null): boolean {
    const layer = this.activeLayer();
    if (!snapshot || !layer) return false;
    const group = findGroup(layer, snapshot.groupId);
    if (!group) return false;
    const items = itemsOf(group);
    if (items.length === 0) return false;
    const byKey = snapshot.key === null ? undefined : items.find((item) => item.dataset['key'] === snapshot.key);
    const target = byKey ?? items[Math.min(Math.max(snapshot.index, 0), items.length - 1)];
    if (!target) return false;
    this.focus(target);
    return true;
  }

  /** Esquece a memória de um grupo (ex.: lista de episódios trocada de temporada). */
  resetGroup(group: HTMLElement): void {
    this.memory.delete(group);
  }

  private enterGroup(group: HTMLElement, from: HTMLElement | null): boolean {
    const items = itemsOf(group);
    if (items.length === 0) return false;
    let index = this.memory.get(group) ?? 0;
    if (group.dataset['entry'] === 'first') index = 0;
    if (group.dataset['entry'] === 'same-index' && from) {
      const fromGroup = groupOf(from);
      index = fromGroup ? itemsOf(fromGroup).indexOf(from) : 0;
    }
    const target = items[Math.min(Math.max(index, 0), items.length - 1)];
    if (!target) return false;
    this.focus(target);
    return true;
  }
}

function isElement(value: HTMLElement | null): value is HTMLElement {
  return value !== null;
}

function groupOf(element: HTMLElement): HTMLElement | null {
  return element.closest<HTMLElement>('[data-focus-group]');
}

function itemsOf(group: HTMLElement): HTMLElement[] {
  return [...group.querySelectorAll<HTMLElement>('[data-focusable]')].filter(
    (item) => !item.hasAttribute('data-disabled') && groupOf(item) === group && !item.closest('[hidden]'),
  );
}

function groupsOf(layer: HTMLElement): HTMLElement[] {
  const groups = [...layer.querySelectorAll<HTMLElement>('[data-focus-group]')];
  if (layer.hasAttribute('data-focus-group')) groups.unshift(layer);
  return groups.filter((group) => !group.closest('[hidden]') && !group.hasAttribute('data-skip'));
}

function findGroup(layer: HTMLElement, id: string): HTMLElement | null {
  return groupsOf(layer).find((group) => group.dataset['focusGroup'] === id) ?? null;
}

function stepWithin(group: HTMLElement, items: HTMLElement[], index: number, direction: Direction): HTMLElement | null {
  const orientation = group.dataset['orientation'] ?? 'horizontal';
  if (index < 0) return null;

  if (orientation === 'grid') {
    const columns = Math.max(1, Number(group.dataset['columns'] ?? '1'));
    const column = index % columns;
    switch (direction) {
      case 'left':
        return column > 0 ? (items[index - 1] ?? null) : null;
      case 'right':
        return column < columns - 1 ? (items[index + 1] ?? null) : null;
      case 'up':
        return items[index - columns] ?? null;
      case 'down': {
        if (items[index + columns]) return items[index + columns] ?? null;
        // Linha de baixo incompleta: vai para o último item dela.
        const nextRowStart = (Math.floor(index / columns) + 1) * columns;
        return nextRowStart < items.length ? (items.at(-1) ?? null) : null;
      }
    }
  }

  const forward = orientation === 'vertical' ? 'down' : 'right';
  const backward = orientation === 'vertical' ? 'up' : 'left';
  if (direction === forward) return items[index + 1] ?? null;
  if (direction === backward) return index > 0 ? (items[index - 1] ?? null) : null;
  return null;
}

const NAV_ATTRIBUTE: Readonly<Record<Direction, string>> = {
  up: 'navUp',
  down: 'navDown',
  left: 'navLeft',
  right: 'navRight',
};

function neighborGroup(layer: HTMLElement, group: HTMLElement, direction: Direction): HTMLElement | null {
  const explicit = group.dataset[NAV_ATTRIBUTE[direction]];
  if (explicit !== undefined) return explicit === '' || explicit === 'none' ? null : findGroup(layer, explicit);
  if (direction === 'left' || direction === 'right') return null;

  // Pilha vertical implícita: só entre grupos que não declaram vizinhos verticais próprios.
  const groups = groupsOf(layer).filter((item) => item.dataset['stack'] !== 'none');
  const index = groups.indexOf(group);
  if (index === -1) return null;
  return (direction === 'down' ? groups[index + 1] : groups[index - 1]) ?? null;
}

function scrollIntoView(element: HTMLElement): void {
  let node: HTMLElement | null = element.parentElement;
  while (node) {
    const modeX = node.dataset['scrollX'];
    const modeY = node.dataset['scrollY'];
    if (modeX !== undefined || modeY !== undefined) {
      // `data-scroll-target` (seletor CSS) alinha um ancestral do item, ex.: a fileira inteira com o título.
      const selector = node.dataset['scrollTarget'];
      const targetY = (selector ? element.closest<HTMLElement>(selector) : null) ?? element;
      const box = node.getBoundingClientRect();
      const pad = Number(node.dataset['scrollPad'] ?? '0');
      // Retângulos vêm em pixels visuais; scrollTop/Left em pixels de layout (diferem com transform: scale).
      const scale = node.offsetWidth > 0 && box.width > 0 ? box.width / node.offsetWidth : 1;
      if (modeX !== undefined) {
        const rect = element.getBoundingClientRect();
        node.scrollLeft = nextOffset(node.scrollLeft, (rect.left - box.left) / scale, rect.width / scale, box.width / scale, pad, modeX);
      }
      if (modeY !== undefined) {
        const rect = targetY.getBoundingClientRect();
        node.scrollTop = nextOffset(node.scrollTop, (rect.top - box.top) / scale, rect.height / scale, box.height / scale, pad, modeY);
      }
    }
    node = node.parentElement;
  }
}

/** Calcula a nova rolagem: "start" alinha no início; "nearest" só rola o necessário. */
export function nextOffset(
  current: number,
  relativeStart: number,
  size: number,
  viewport: number,
  pad: number,
  mode: string,
): number {
  if (mode === 'start') return Math.max(0, current + relativeStart - pad);
  if (relativeStart < pad) return Math.max(0, current + relativeStart - pad);
  if (relativeStart + size > viewport - pad) return Math.max(0, current + relativeStart + size - viewport + pad);
  return current;
}
