import { isDirection, type RemoteKey } from '../platform/keys';
import { h } from '../utils/dom';
import type { FocusManager } from './focus-manager';

export interface OverlayOptions {
  /** Voltar: padrão é fechar o overlay. */
  readonly onBack?: () => void;
  /** Teclas extras (ex.: mídia) antes da navegação padrão. */
  readonly onKey?: (key: RemoteKey) => boolean;
  readonly initialFocus?: HTMLElement | null;
}

export interface OverlayHandle {
  close(): void;
  readonly element: HTMLElement;
}

interface Entry {
  readonly element: HTMLElement;
  readonly options: OverlayOptions;
  readonly restoreTo: HTMLElement | null;
  readonly handle: OverlayHandle;
}

/**
 * Diálogos e menus sobrepostos. Cada overlay vira uma camada no FocusManager:
 * o foco fica preso nele até fechar, e depois volta ao item de origem.
 */
export class OverlayManager {
  private readonly stack: Entry[] = [];

  constructor(
    private readonly host: HTMLElement,
    private readonly focus: FocusManager,
  ) {}

  get isOpen(): boolean {
    return this.stack.length > 0;
  }

  open(element: HTMLElement, options: OverlayOptions = {}): OverlayHandle {
    const restoreTo = this.focus.current();
    const handle: OverlayHandle = { element, close: () => this.close(entry) };
    const entry: Entry = { element, options, restoreTo, handle };
    this.stack.push(entry);
    this.host.appendChild(element);
    this.focus.pushLayer(element);
    if (options.initialFocus) this.focus.focus(options.initialFocus);
    else this.focus.focusFirst();
    return handle;
  }

  /** Retorna true se havia overlay aberto (a tecla não deve chegar à tela). */
  handleKey(key: RemoteKey): boolean {
    const top = this.stack.at(-1);
    if (!top) return false;
    if (top.options.onKey?.(key)) return true;
    if (isDirection(key)) this.focus.move(key);
    else if (key === 'enter') this.focus.current()?.click();
    else if (key === 'back') {
      if (top.options.onBack) top.options.onBack();
      else this.close(top);
    }
    return true;
  }

  closeAll(): void {
    while (this.stack.length > 0) {
      const top = this.stack.at(-1);
      if (top) this.close(top);
    }
  }

  private close(entry: Entry): void {
    const index = this.stack.indexOf(entry);
    if (index === -1) return;
    this.stack.splice(index, 1);
    entry.element.remove();
    this.focus.popLayer(entry.element, entry.restoreTo);
  }
}

export interface DialogAction<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly primary?: boolean;
}

/** Diálogo modal com botões. Voltar resolve `null`. */
export function showDialog<T extends string>(
  overlays: OverlayManager,
  options: { title: string; message?: string; actions: readonly DialogAction<T>[] },
): Promise<T | null> {
  return new Promise((resolve) => {
    let handle: OverlayHandle | null = null;
    const finish = (value: T | null): void => {
      handle?.close();
      resolve(value);
    };
    const buttons = options.actions.map((action) =>
      h(
        'div',
        {
          class: `button${action.primary ? ' button--primary' : ''}`,
          'data-focusable': true,
          'data-key': action.value,
          role: 'button',
          onclick: () => finish(action.value),
        },
        action.label,
      ),
    );
    const element = h(
      'div',
      { class: 'overlay overlay--dialog', role: 'dialog', 'aria-modal': 'true' },
      h(
        'div',
        { class: 'dialog' },
        h('h2', { class: 'dialog__title' }, options.title),
        options.message ? h('p', { class: 'dialog__message' }, options.message) : null,
        h('div', { class: 'dialog__actions', 'data-focus-group': 'dialog-actions', 'data-orientation': 'horizontal' }, buttons),
      ),
    );
    handle = overlays.open(element, { onBack: () => finish(null) });
  });
}

/** Aviso temporário sem foco (erros de legenda, biblioteca atualizada...). */
export function showToast(host: HTMLElement, message: string, durationMs = 4000): void {
  const toast = h('div', { class: 'toast', role: 'status' }, message);
  host.appendChild(toast);
  window.setTimeout(() => toast.classList.add('toast--visible'), 16);
  window.setTimeout(() => {
    toast.classList.remove('toast--visible');
    window.setTimeout(() => toast.remove(), 400);
  }, durationMs);
}
