import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FocusManager, nextOffset } from '../src/navigation/focus-manager';
import { OverlayManager, showDialog } from '../src/navigation/overlays';
import { Router, type Screen } from '../src/navigation/router';
import { toRemoteKey, TIZEN_KEY_CODES } from '../src/platform/keys';
import { h } from '../src/utils/dom';

function item(key: string): HTMLElement {
  return h('div', { 'data-focusable': true, 'data-key': key }, key);
}

function group(id: string, orientation: string, keys: string[], extra: Record<string, string> = {}): HTMLElement {
  return h('div', { 'data-focus-group': id, 'data-orientation': orientation, ...extra }, keys.map(item));
}

const currentKey = (focus: FocusManager): string | undefined => focus.current()?.dataset['key'];

describe('toRemoteKey — teclas do controle Samsung e do teclado', () => {
  it('mapeia os keyCodes do Tizen', () => {
    expect(toRemoteKey({ keyCode: 10009, key: 'XF86Back' })).toBe('back');
    expect(toRemoteKey({ keyCode: 10252, key: 'MediaPlayPause' })).toBe('playPause');
    expect(toRemoteKey({ keyCode: 415, key: 'MediaPlay' })).toBe('play');
    expect(toRemoteKey({ keyCode: 19, key: 'MediaPause' })).toBe('pause');
    expect(toRemoteKey({ keyCode: 417, key: 'MediaFastForward' })).toBe('fastForward');
    expect(toRemoteKey({ keyCode: 412, key: 'MediaRewind' })).toBe('rewind');
    expect(toRemoteKey({ keyCode: 13, key: 'Enter' })).toBe('enter');
    expect(Object.values(TIZEN_KEY_CODES)).toContain('up');
  });

  it('simula o controle pelo teclado no navegador', () => {
    expect(toRemoteKey({ keyCode: 8, key: 'Backspace' })).toBe('back');
    expect(toRemoteKey({ keyCode: 27, key: 'Escape' })).toBe('back');
    expect(toRemoteKey({ keyCode: 32, key: ' ' })).toBe('playPause');
    expect(toRemoteKey({ keyCode: 53, key: '5' })).toBe('digit5');
    expect(toRemoteKey({ keyCode: 99, key: '3' })).toBe('digit3');
    expect(toRemoteKey({ keyCode: 65, key: 'a' })).toBeNull();
  });
});

describe('FocusManager', () => {
  let root: HTMLElement;
  let focus: FocusManager;

  beforeEach(() => {
    document.body.innerHTML = '';
    root = h(
      'div',
      {},
      group('nav', 'horizontal', ['settings']),
      group('row-continue', 'horizontal', ['c1', 'c2']),
      group('row-movies', 'horizontal', ['m1', 'm2', 'm3', 'm4']),
    );
    document.body.appendChild(root);
    focus = new FocusManager();
    focus.setRoot(root);
  });

  it('navega dentro da fileira e não sai pelas pontas', () => {
    focus.focusFirst('row-movies');
    expect(focus.move('right')).toBe(true);
    expect(focus.move('right')).toBe(true);
    expect(currentKey(focus)).toBe('m3');
    expect(focus.move('left')).toBe(true);
    expect(focus.move('left')).toBe(true);
    expect(focus.move('left')).toBe(false);
    expect(currentKey(focus)).toBe('m1');
  });

  it('cima/baixo trocam de fileira e cada fileira lembra o card focado', () => {
    focus.focusFirst('row-movies');
    focus.move('right');
    focus.move('right'); // m3
    focus.move('up'); // continue
    expect(currentKey(focus)).toBe('c1');
    focus.move('right'); // c2
    focus.move('down');
    expect(currentKey(focus)).toBe('m3'); // lembrou
    focus.move('up');
    expect(currentKey(focus)).toBe('c2'); // lembrou
    focus.move('up');
    expect(currentKey(focus)).toBe('settings');
    expect(focus.move('up')).toBe(false);
  });

  it('marca o item e o grupo focados com classes', () => {
    focus.focusFirst('row-continue');
    expect(root.querySelector('.is-focused')?.getAttribute('data-key')).toBe('c1');
    expect(root.querySelector('.has-focus')?.getAttribute('data-focus-group')).toBe('row-continue');
    focus.move('down');
    expect(root.querySelectorAll('.is-focused')).toHaveLength(1);
  });

  it('respeita vizinhos explícitos (temporadas ↔ episódios na tela de série)', () => {
    root.innerHTML = '';
    root.append(
      group('actions', 'horizontal', ['continue', 'next'], { 'data-nav-down': 'seasons' }),
      group('seasons', 'vertical', ['s1', 's2'], { 'data-nav-right': 'episodes', 'data-nav-up': 'actions', 'data-nav-down': 'none' }),
      group('episodes', 'vertical', ['e1', 'e2', 'e3'], { 'data-nav-left': 'seasons', 'data-nav-up': 'actions', 'data-nav-down': 'none' }),
    );
    focus.setRoot(root);
    focus.focusFirst('actions');
    focus.move('down');
    expect(currentKey(focus)).toBe('s1');
    focus.move('down');
    expect(currentKey(focus)).toBe('s2');
    expect(focus.move('down')).toBe(false);
    focus.move('right');
    expect(currentKey(focus)).toBe('e1');
    focus.move('down');
    focus.move('down');
    expect(currentKey(focus)).toBe('e3');
    focus.move('left');
    expect(currentKey(focus)).toBe('s2');
    focus.move('right');
    expect(currentKey(focus)).toBe('e3');
    focus.move('up');
    focus.move('up');
    focus.move('up');
    expect(currentKey(focus)).toBe('continue');
  });

  it('navega em grade (teclado numérico das configurações)', () => {
    root.innerHTML = '';
    root.append(group('keypad', 'grid', ['1', '2', '3', '4', '5', '6', '7'], { 'data-columns': '3' }));
    focus.setRoot(root);
    focus.focusFirst('keypad');
    focus.move('down');
    expect(currentKey(focus)).toBe('4');
    focus.move('right');
    focus.move('right');
    expect(focus.move('right')).toBe(false);
    expect(currentKey(focus)).toBe('6');
    focus.move('down'); // linha incompleta: vai ao último
    expect(currentKey(focus)).toBe('7');
  });

  it('ignora itens desabilitados e grupos ocultos/vazios', () => {
    root.innerHTML = '';
    const hidden = group('hidden', 'horizontal', ['x']);
    hidden.hidden = true;
    const withDisabled = group('row', 'horizontal', ['a', 'b', 'c']);
    withDisabled.children[1]?.setAttribute('data-disabled', '');
    root.append(group('top', 'horizontal', ['t']), hidden, group('empty', 'horizontal', []), withDisabled);
    focus.setRoot(root);
    focus.focusFirst('top');
    focus.move('down');
    expect(currentKey(focus)).toBe('a');
    focus.move('right');
    expect(currentKey(focus)).toBe('c');
  });

  it('snapshot/restore volta ao mesmo item pelo data-key mesmo se a lista mudar de ordem', () => {
    focus.focusFirst('row-movies');
    focus.move('right');
    focus.move('right'); // m3
    const snapshot = focus.snapshot();
    expect(snapshot).toEqual({ groupId: 'row-movies', index: 2, key: 'm3' });

    // A tela é redesenhada com outra ordem (ex.: "Continuar assistindo" mudou).
    root.innerHTML = '';
    root.append(group('row-movies', 'horizontal', ['m3', 'm1', 'm2']));
    focus.setRoot(root);
    expect(focus.restore(snapshot)).toBe(true);
    expect(currentKey(focus)).toBe('m3');

    root.innerHTML = '';
    root.append(group('row-movies', 'horizontal', ['z1', 'z2']));
    focus.setRoot(root);
    focus.restore(snapshot); // sem o item: usa o índice limitado
    expect(currentKey(focus)).toBe('z2');
  });

  it('camadas (diálogos) prendem o foco e devolvem ao item anterior', () => {
    focus.focusFirst('row-movies');
    focus.move('right'); // m2
    const dialog = group('dialog', 'horizontal', ['ok', 'cancel']);
    document.body.appendChild(dialog);
    focus.pushLayer(dialog);
    focus.focusFirst();
    expect(currentKey(focus)).toBe('ok');
    expect(focus.move('up')).toBe(false); // não escapa do diálogo
    dialog.remove();
    focus.popLayer(dialog, root.querySelector<HTMLElement>('[data-key="m2"]'));
    expect(currentKey(focus)).toBe('m2');
  });

  it('notifica ouvintes de foco', () => {
    const listener = vi.fn();
    const unsubscribe = focus.onFocus(listener);
    focus.focusFirst('row-movies');
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ dataset: expect.objectContaining({ key: 'm1' }) }), expect.anything());
    unsubscribe();
    focus.move('right');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('calcula rolagem "start" e "nearest"', () => {
    expect(nextOffset(0, 800, 200, 1000, 0, 'start')).toBe(800);
    expect(nextOffset(500, -100, 200, 1000, 20, 'start')).toBe(380);
    expect(nextOffset(0, 300, 200, 1000, 20, 'nearest')).toBe(0);
    expect(nextOffset(0, 900, 200, 1000, 20, 'nearest')).toBe(120);
    expect(nextOffset(300, 10, 200, 1000, 20, 'nearest')).toBe(290);
  });
});

class FakeScreen implements Screen {
  readonly root: HTMLElement;
  shown = 0;
  destroyed = false;
  constructor(
    readonly name: string,
    keys: string[],
  ) {
    this.root = h('div', { class: name }, group(`${name}-group`, 'horizontal', keys));
  }
  mount(): void {}
  onShow(): void {
    this.shown++;
  }
  destroy(): void {
    this.destroyed = true;
  }
}

describe('Router — Voltar e restauração de foco', () => {
  it('volta ao item selecionado anteriormente e só sai do app pela raiz', async () => {
    document.body.innerHTML = '';
    const container = h('div');
    document.body.appendChild(container);
    const focus = new FocusManager();
    const onBackAtRoot = vi.fn();
    const router = new Router(container, focus, onBackAtRoot);

    const home = new FakeScreen('home', ['a', 'b', 'c']);
    await router.push(home);
    router.handleKey('right');
    router.handleKey('right');
    expect(currentKey(focus)).toBe('c');

    const details = new FakeScreen('details', ['play']);
    await router.push(details);
    expect(home.root.hidden).toBe(true);
    expect(currentKey(focus)).toBe('play');

    router.handleKey('back');
    expect(details.destroyed).toBe(true);
    expect(home.root.hidden).toBe(false);
    expect(home.shown).toBe(1);
    expect(currentKey(focus)).toBe('c'); // foco restaurado
    expect(onBackAtRoot).not.toHaveBeenCalled();

    router.handleKey('back'); // na raiz: não fecha sozinho, pede confirmação
    expect(onBackAtRoot).toHaveBeenCalledTimes(1);
    expect(router.depth).toBe(1);
  });

  it('Enter aciona o item focado', async () => {
    document.body.innerHTML = '';
    const container = h('div');
    document.body.appendChild(container);
    const focus = new FocusManager();
    const router = new Router(container, focus, () => undefined);
    const screen = new FakeScreen('s', ['x']);
    const clicked = vi.fn();
    screen.root.querySelector('[data-key="x"]')?.addEventListener('click', clicked);
    await router.push(screen);
    router.handleKey('enter');
    expect(clicked).toHaveBeenCalledTimes(1);
  });
});

describe('Diálogos', () => {
  it('resolve com o botão escolhido ou null ao apertar Voltar', async () => {
    document.body.innerHTML = '';
    const root = h('div', {}, group('g', 'horizontal', ['origem']));
    const host = h('div');
    document.body.append(root, host);
    const focus = new FocusManager();
    focus.setRoot(root);
    focus.focusFirst();
    const overlays = new OverlayManager(host, focus);

    const first = showDialog(overlays, { title: 'Continuar?', actions: [{ value: 'resume', label: 'Continuar' }, { value: 'start', label: 'Início' }] });
    expect(overlays.isOpen).toBe(true);
    overlays.handleKey('right');
    overlays.handleKey('enter');
    await expect(first).resolves.toBe('start');
    expect(overlays.isOpen).toBe(false);
    expect(currentKey(focus)).toBe('origem');

    const second = showDialog(overlays, { title: 'Sair?', actions: [{ value: 'exit', label: 'Sair' }] });
    overlays.handleKey('back');
    await expect(second).resolves.toBeNull();
  });
});
