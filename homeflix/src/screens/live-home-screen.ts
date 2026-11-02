import { ApiError } from '../api/media-api';
import type { AppContext } from '../app-context';
import { button, mainNav, spinner } from '../components/ui';
import type { Screen } from '../navigation/router';
import type { RemoteKey } from '../platform/keys';
import { clear, h } from '../utils/dom';
import { hashString } from '../utils/format';
import { ChannelsScreen } from './channels-screen';
import { SettingsScreen } from './settings-screen';

const COLUMNS = 5;

/** Aba "Canais ao vivo": categorias da lista IPTV, carregadas só ao abrir a aba. */
export class LiveHomeScreen implements Screen {
  readonly name = 'live-home';
  readonly root: HTMLElement;
  private readonly body = h('div', { class: 'live-home__scroll', 'data-scroll-y': 'nearest', 'data-scroll-pad': '60' });

  constructor(private readonly ctx: AppContext) {
    const nav = mainNav('live', {
      library: () => ctx.router.back(),
      live: () => undefined,
      settings: () => void ctx.router.push(new SettingsScreen(ctx)),
    });
    this.root = h('div', { class: 'screen live-home' }, nav, this.body);
  }

  async mount(): Promise<void> {
    await this.load(false);
  }

  onKey(key: RemoteKey): boolean {
    if (key === 'red') {
      void this.load(true);
      return true;
    }
    return false;
  }

  private async load(force: boolean): Promise<void> {
    clear(this.body);
    this.body.appendChild(
      h('div', { class: 'state' }, spinner(), h('p', {}, 'Carregando canais... listas grandes podem levar alguns segundos.')),
    );
    this.ctx.focus.focusFirst('nav');
    try {
      const groups = await this.ctx.catalog.channelGroups(force);
      clear(this.body);
      if (!groups.configured || groups.items.length === 0) {
        this.renderMessage(
          groups.configured ? 'Nenhum canal na lista' : 'Canais ao vivo não configurados',
          groups.errors[0] ?? 'Configure IPTV_SOURCE no .env do servidor com a sua lista M3U e reinicie o servidor.',
        );
        return;
      }
      const grid = h(
        'div',
        { class: 'group-grid', 'data-focus-group': 'groups', 'data-orientation': 'grid', 'data-columns': String(COLUMNS) },
        groups.items.map((group) => {
          const tile = h(
            'div',
            {
              class: 'group-tile',
              'data-focusable': true,
              'data-key': `group:${group.name}`,
              role: 'button',
              onclick: () => void this.ctx.router.push(new ChannelsScreen(this.ctx, group.name)),
            },
            h('div', { class: 'group-tile__name' }, group.name),
            h('div', { class: 'group-tile__count' }, group.count === 1 ? '1 canal' : `${group.count} canais`),
          );
          tile.style.backgroundImage = `linear-gradient(135deg, hsl(${hashString(group.name) % 360}, 40%, 22%), #14141b)`;
          return tile;
        }),
      );
      this.body.append(h('h2', { class: 'live-home__title' }, `${groups.items.length} categorias · ${groups.total} canais`), grid);
      this.ctx.focus.focusFirst('groups');
    } catch (error) {
      clear(this.body);
      this.renderMessage('Não foi possível carregar os canais', error instanceof ApiError ? error.message : 'Erro inesperado.');
    }
  }

  private renderMessage(title: string, message: string): void {
    this.body.appendChild(
      h(
        'div',
        { class: 'state state--error' },
        h('h2', {}, title),
        h('p', {}, message),
        h(
          'div',
          { class: 'state__actions', 'data-focus-group': 'live-actions', 'data-orientation': 'horizontal' },
          button('Tentar novamente', { icon: 'refresh', primary: true, onClick: () => void this.load(true) }),
        ),
      ),
    );
    this.ctx.focus.focusFirst('live-actions');
  }
}
