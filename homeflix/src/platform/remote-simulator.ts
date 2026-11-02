import { h } from '../utils/dom';
import type { RemoteKey } from './keys';

const BUTTONS: readonly (readonly [RemoteKey, string, string])[] = [
  ['up', '▲', 'Cima (↑)'],
  ['left', '◀', 'Esquerda (←)'],
  ['enter', 'OK', 'OK (Enter)'],
  ['right', '▶', 'Direita (→)'],
  ['down', '▼', 'Baixo (↓)'],
  ['back', '↩', 'Voltar (Backspace/Esc)'],
  ['playPause', '⏯', 'Play/Pause (Espaço)'],
  ['rewind', '⏪', 'Retroceder (R ou ,)'],
  ['fastForward', '⏩', 'Avançar (F ou .)'],
  ['stop', '⏹', 'Parar (S)'],
  ['red', 'A', 'Vermelho (F1): atualizar início'],
  ['yellow', 'C', 'Amarelo (F3): legendas no player'],
];

/**
 * Modo de desenvolvimento no navegador: um controle remoto virtual clicável e
 * o mapeamento do teclado. Pressione H para mostrar/ocultar. Não aparece na TV.
 */
export function installRemoteSimulator(host: HTMLElement, dispatch: (key: RemoteKey) => void): void {
  const panel = h(
    'aside',
    { class: 'remote-sim', 'aria-label': 'Controle remoto simulado' },
    h('div', { class: 'remote-sim__title' }, 'Controle simulado · H oculta'),
    h(
      'div',
      { class: 'remote-sim__grid' },
      BUTTONS.map(([key, label, title]) =>
        h(
          'button',
          {
            class: `remote-sim__key remote-sim__key--${key}`,
            type: 'button',
            title,
            tabindex: '-1',
            onmousedown: (event: Event) => event.preventDefault(),
            onclick: () => dispatch(key),
          },
          label,
        ),
      ),
    ),
    h('div', { class: 'remote-sim__hint' }, 'Teclado: setas, Enter, Backspace/Esc, Espaço, F/R, 0-9'),
  );
  host.appendChild(panel);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'h' || event.key === 'H') panel.classList.toggle('remote-sim--hidden');
  });
}
