import type { CardItem, HomeSection } from '../models/library';
import { h } from '../utils/dom';
import { displayTitle, hashString } from '../utils/format';
import logoUrl from '../assets/brand/logo.png';

const SVG_NS = 'http://www.w3.org/2000/svg';

const ICON_PATHS = {
  play: 'M8 5.5v13l11-6.5z',
  pause: 'M7 5h4v14H7zM13 5h4v14h-4z',
  rewind: 'M11 6.5v11L3.5 12zM20.5 6.5v11L13 12z',
  forward: 'M3.5 6.5v11L11 12zM13 6.5v11l7.5-5.5z',
  next: 'M5 6v12l9-6zM16 6h2.5v12H16z',
  restart: 'M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z',
  subtitles:
    'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm2 8v2h5v-2zm7 0v2h5v-2zm-7-3v2h8v-2zm10 0v2h2v-2z',
  episodes: 'M4 6h16v2H4zm0 5h16v2H4zm0 5h10v2H4z',
  info: 'M11 10h2v7h-2zm0-4h2v2h-2zM12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z',
  settings:
    'M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.4 2.9a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.2 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1L11 21h4l.4-2.9c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z',
  check: 'M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L21 7.5l-1.4-1.4z',
  back: 'M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z',
  refresh: 'M17.7 6.3A8 8 0 1 0 19.7 14h-2.1a6 6 0 1 1-1.4-6.2L13 11h7V4z',
} as const;

export type IconName = keyof typeof ICON_PATHS;

export function icon(name: IconName, className = 'icon'): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', ICON_PATHS[name]);
  path.setAttribute('fill', 'currentColor');
  svg.appendChild(path);
  return svg;
}

export interface ButtonOptions {
  readonly icon?: IconName;
  readonly primary?: boolean;
  readonly key?: string;
  readonly className?: string;
  readonly onClick: () => void;
}

export function button(label: string, options: ButtonOptions): HTMLElement {
  return h(
    'div',
    {
      class: `button${options.primary ? ' button--primary' : ''}${options.className ? ` ${options.className}` : ''}`,
      role: 'button',
      'data-focusable': true,
      'data-key': options.key ?? label,
      onclick: () => options.onClick(),
    },
    options.icon ? icon(options.icon) : null,
    label ? h('span', { class: 'button__label' }, label) : null,
  );
}

export function progressBar(fraction: number | null, className = 'progress'): HTMLElement | null {
  if (fraction === null) return null;
  const bar = h('div', { class: className }, h('div', { class: `${className}__fill` }));
  (bar.firstElementChild as HTMLElement).style.width = `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`;
  return bar;
}

/**
 * Capa real (quando existe na pasta) ou placeholder elegante gerado a partir do
 * título: gradiente com matiz estável + título. Nada de capas inventadas.
 */
export function artwork(title: string, artworkUrl: string | null, resolve: (path: string) => string, variant = 'card'): HTMLElement {
  const hue = hashString(title) % 360;
  const placeholder = h(
    'div',
    { class: `artwork__placeholder artwork__placeholder--${variant}` },
    h('span', { class: 'artwork__mark' }, 'MULTIFLIX'),
    h('span', { class: 'artwork__title' }, displayTitle(title)),
  );
  placeholder.style.backgroundImage = `linear-gradient(135deg, hsl(${hue}, 45%, 24%) 0%, hsl(${(hue + 40) % 360}, 55%, 12%) 70%, #0b0b0f 100%)`;

  const container = h('div', { class: `artwork artwork--${variant}` }, placeholder);
  if (artworkUrl) {
    const image = h('img', { class: 'artwork__image', alt: '', decoding: 'async' });
    image.addEventListener('load', () => container.classList.add('artwork--loaded'));
    image.addEventListener('error', () => image.remove()); // mantém o placeholder
    image.src = resolve(artworkUrl);
    container.appendChild(image);
  }
  return container;
}

export function card(item: CardItem, resolve: (path: string) => string, onSelect: (item: CardItem) => void): HTMLElement {
  return h(
    'div',
    {
      class: 'card',
      role: 'button',
      'data-focusable': true,
      'data-key': item.key,
      onclick: () => onSelect(item),
    },
    artwork(item.title, item.artworkUrl, resolve, 'poster'),
    item.badge ? h('span', { class: 'card__badge' }, icon('check', 'icon icon--small'), item.badge) : null,
    progressBar(item.progress, 'card-progress'),
    h('div', { class: 'card__caption' }, h('div', { class: 'card__title' }, displayTitle(item.title)), h('div', { class: 'card__subtitle' }, item.subtitle)),
  );
}

export function row(section: HomeSection, resolve: (path: string) => string, onSelect: (item: CardItem) => void): HTMLElement {
  return h(
    'section',
    { class: 'row', 'data-section': section.id },
    h('h2', { class: 'row__title' }, section.title),
    h(
      'div',
      { class: 'row__viewport', 'data-scroll-x': 'start', 'data-scroll-pad': '0' },
      h(
        'div',
        { class: 'row__track', 'data-focus-group': `row-${section.id}`, 'data-orientation': 'horizontal' },
        section.items.map((item) => card(item, resolve, onSelect)),
      ),
    ),
  );
}

export function spinner(): HTMLElement {
  return h('div', { class: 'spinner', role: 'progressbar', 'aria-label': 'Carregando' });
}

export function brand(): HTMLElement {
  return h('img', { class: 'brand', src: logoUrl, alt: 'MultiFlix', decoding: 'async' });
}

/** Pôster nítido (vertical) ao lado do texto, no banner e nos detalhes. Só quando há imagem real. */
export function posterPanel(title: string, artworkUrl: string | null, resolve: (path: string) => string, className: string): HTMLElement | null {
  return artworkUrl ? h('div', { class: className }, artwork(title, artworkUrl, resolve, 'poster')) : null;
}
