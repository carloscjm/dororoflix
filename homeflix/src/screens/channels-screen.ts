import type { AppContext } from '../app-context';
import { brand, spinner } from '../components/ui';
import type { Channel } from '../models/media';
import type { Screen } from '../navigation/router';
import { clear, h } from '../utils/dom';
import { hashString } from '../utils/format';
import { LivePlayerScreen } from './live-player-screen';

const COLUMNS = 6;

/** Grade de canais de uma categoria da lista IPTV (carregada ao abrir a categoria). */
export class ChannelsScreen implements Screen {
  readonly name = 'channels';
  readonly root: HTMLElement;
  private readonly body = h('div', { class: 'channels__scroll', 'data-scroll-y': 'nearest', 'data-scroll-pad': '60' });
  private channels: Channel[] = [];

  constructor(
    private readonly ctx: AppContext,
    private readonly group: string,
  ) {
    this.root = h(
      'div',
      { class: 'screen channels' },
      h('header', { class: 'topbar' }, brand(), h('div', { class: 'topbar__title' }, `Canais ao vivo · ${group}`)),
      this.body,
    );
  }

  async mount(): Promise<void> {
    this.body.appendChild(h('div', { class: 'state' }, spinner(), h('p', {}, 'Carregando canais...')));
    try {
      this.channels = await this.ctx.catalog.channelsOf(this.group);
    } catch (error) {
      clear(this.body);
      this.body.appendChild(
        h('div', { class: 'state state--error' }, h('h2', {}, 'Não foi possível carregar os canais'), h('p', {}, error instanceof Error ? error.message : '')),
      );
      return;
    }
    clear(this.body);
    this.body.appendChild(
      h(
        'div',
        { class: 'channel-grid', 'data-focus-group': 'channels', 'data-orientation': 'grid', 'data-columns': String(COLUMNS) },
        this.channels.map((channel, index) => channelTile(channel, () => void this.play(index))),
      ),
    );
    this.ctx.focus.focusFirst('channels');
  }

  private async play(index: number): Promise<void> {
    await this.ctx.router.push(new LivePlayerScreen(this.ctx, this.channels, index));
  }
}

/** Logo do canal (quando a lista traz) sobre um fundo neutro; sem logo, as iniciais. */
export function channelTile(channel: Channel, onSelect: () => void): HTMLElement {
  const initials = channel.name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
  const art = h('div', { class: 'channel-tile__art' }, h('span', { class: 'channel-tile__initials' }, initials));
  art.style.backgroundColor = `hsl(${hashString(channel.name) % 360}, 30%, 18%)`;
  if (channel.logo) {
    const image = h('img', { class: 'channel-tile__logo', alt: '', decoding: 'async', loading: 'lazy' });
    image.addEventListener('load', () => art.classList.add('channel-tile__art--logo'));
    image.addEventListener('error', () => image.remove());
    image.src = channel.logo;
    art.appendChild(image);
  }
  return h(
    'div',
    { class: 'channel-tile', 'data-focusable': true, 'data-key': channel.id, role: 'button', onclick: onSelect },
    art,
    h('div', { class: 'channel-tile__name' }, channel.name),
  );
}
