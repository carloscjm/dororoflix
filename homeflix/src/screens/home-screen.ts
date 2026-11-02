import { ApiError } from '../api/media-api';
import type { AppContext } from '../app-context';
import { artwork, button, mainNav, posterPanel, progressBar, row, spinner } from '../components/ui';
import { buildHomeSections, type CardItem, type HomeSection } from '../models/library';
import type { Screen } from '../navigation/router';
import type { RemoteKey } from '../platform/keys';
import { append, clear, h } from '../utils/dom';
import { displayTitle, formatBytes, yearFromTitle } from '../utils/format';
import { ChannelsScreen } from './channels-screen';
import { LiveHomeScreen } from './live-home-screen';
import { MovieScreen } from './movie-screen';
import { playVideo } from './player-screen';
import { SeriesScreen } from './series-screen';
import { SettingsScreen } from './settings-screen';

/** Tela inicial: banner do item em foco + fileiras de cards. */
export class HomeScreen implements Screen {
  readonly name = 'home';
  readonly root: HTMLElement;
  private readonly hero = h('div', { class: 'hero' });
  private readonly rows = h('div', { class: 'home__rows', 'data-scroll-y': 'start', 'data-scroll-target': '.row', 'data-scroll-pad': '0' });
  private readonly body = h('div', { class: 'home__body' });
  private cards = new Map<string, CardItem>();
  private heroKey: string | null = null;
  private heroTimer: number | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly ctx: AppContext) {
    const nav = mainNav('library', {
      library: () => undefined,
      live: () => void ctx.router.push(new LiveHomeScreen(ctx)),
      settings: () => void ctx.router.push(new SettingsScreen(ctx)),
    });
    this.root = h('div', { class: 'screen home' }, nav, this.hero, this.body);
  }

  async mount(): Promise<void> {
    this.unsubscribe = this.ctx.focus.onFocus((element) => this.scheduleHero(element.dataset['key'] ?? null));
    await this.load(false);
  }

  onShow(): void {
    // Voltando do player/detalhes: o progresso mudou, então as fileiras são remontadas.
    // O Router restaura o foco pelo data-key logo depois.
    if (this.ctx.catalog.loaded) this.render(buildHomeSections(this.ctx.catalog.loaded, this.ctx.progress));
  }

  onKey(key: RemoteKey): boolean {
    if (key === 'red') {
      void this.load(true);
      return true;
    }
    return false;
  }

  destroy(): void {
    this.unsubscribe?.();
    if (this.heroTimer !== null) window.clearTimeout(this.heroTimer);
  }

  private async load(force: boolean): Promise<void> {
    clear(this.body);
    this.body.appendChild(h('div', { class: 'state' }, spinner(), h('p', {}, 'Carregando sua biblioteca...')));
    try {
      const library = await this.ctx.catalog.load(force);
      this.render(buildHomeSections(library, this.ctx.progress));
      const firstRow = this.rows.querySelector<HTMLElement>('[data-focus-group]');
      this.ctx.focus.focusFirst(firstRow?.dataset['focusGroup'] ?? 'nav');
    } catch (error) {
      this.renderError(error);
    }
  }

  private render(sections: HomeSection[]): void {
    this.cards = new Map(sections.flatMap((section) => section.items.map((item) => [item.key, item] as const)));
    clear(this.body);
    clear(this.rows);

    if (sections.length === 0) {
      this.renderHero(null);
      this.body.appendChild(
        h(
          'div',
          { class: 'state' },
          h('h2', {}, 'Nenhum vídeo encontrado'),
          h('p', {}, 'Coloque filmes e séries na pasta de mídia do PC e atualize a biblioteca em Configurações.'),
        ),
      );
      return;
    }

    for (const section of sections) {
      this.rows.appendChild(row(section, (path) => this.ctx.api.resolve(path), (item) => void this.open(item)));
    }
    this.body.appendChild(this.rows);
    const first = sections[0]?.items[0] ?? null;
    if (!this.heroKey || !this.cards.has(this.heroKey)) this.renderHero(first);
    else this.renderHero(this.cards.get(this.heroKey) ?? first);
  }

  private renderError(error: unknown): void {
    clear(this.body);
    const message = error instanceof ApiError ? error.message : 'Erro inesperado ao carregar a biblioteca.';
    const actions = h(
      'div',
      { class: 'state__actions', 'data-focus-group': 'error-actions', 'data-orientation': 'horizontal' },
      button('Tentar novamente', { icon: 'refresh', primary: true, onClick: () => void this.load(true) }),
      button('Configurações', { icon: 'settings', onClick: () => void this.ctx.router.push(new SettingsScreen(this.ctx)) }),
    );
    this.body.appendChild(
      h(
        'div',
        { class: 'state state--error' },
        h('h2', {}, 'Não foi possível conectar ao servidor'),
        h('p', {}, message),
        h('p', { class: 'state__hint' }, `Servidor: ${this.ctx.api.resolve('') || 'mesma origem (modo navegador)'}`),
        actions,
      ),
    );
    this.renderHero(null);
    this.ctx.focus.focusFirst('error-actions');
  }

  private scheduleHero(key: string | null): void {
    if (key === null || !this.cards.has(key) || key === this.heroKey) return;
    if (this.heroTimer !== null) window.clearTimeout(this.heroTimer);
    // Pequeno atraso: navegar rápido pelos cards não redesenha o banner a cada passo.
    this.heroTimer = window.setTimeout(() => this.renderHero(this.cards.get(key) ?? null), 150);
  }

  private renderHero(item: CardItem | null): void {
    this.heroKey = item?.key ?? null;
    clear(this.hero);
    if (!item) {
      this.hero.classList.add('hero--empty');
      return;
    }
    this.hero.classList.remove('hero--empty');
    const details = this.heroDetails(item);
    append(this.hero, [
      artwork(item.title, item.artworkUrl, (path) => this.ctx.api.resolve(path), 'hero'),
      h('div', { class: 'hero__shade' }),
      posterPanel(item.title, item.artworkUrl, (path) => this.ctx.api.resolve(path), 'hero__poster'),
      h(
        'div',
        { class: 'hero__content' },
        h('div', { class: 'hero__kind' }, details.kind),
        h('h1', { class: 'hero__title' }, displayTitle(item.title)),
        h('div', { class: 'hero__meta' }, details.meta),
        progressBar(item.progress, 'hero-progress'),
        h('div', { class: 'hero__hint' }, 'Pressione OK para abrir'),
      ),
    ]);
  }

  private heroDetails(item: CardItem): { kind: string; meta: string } {
    const target = item.target;
    if (target.type === 'liveGroup') return { kind: 'TV ao vivo', meta: item.subtitle };
    if (target.type === 'series' || (target.type === 'resume' && target.seriesId)) {
      const seriesId = target.type === 'series' ? target.seriesId : (target.seriesId ?? '');
      const series = this.ctx.catalog.series(seriesId);
      const meta = series ? `${series.seasonCount} temporada(s) · ${series.episodeCount} episódio(s)` : '';
      return { kind: 'Série', meta: target.type === 'resume' ? `${item.subtitle}` : meta };
    }
    const video = this.ctx.catalog.video(target.videoId);
    if (!video) return { kind: 'Filme', meta: '' };
    const year = yearFromTitle(video.title);
    const parts = [year ? String(year) : null, video.format.toUpperCase(), formatBytes(video.sizeBytes)];
    if (video.subtitles.length > 0) parts.push(`${video.subtitles.length} legenda(s)`);
    return { kind: 'Filme', meta: parts.filter(Boolean).join(' · ') };
  }

  private async open(item: CardItem): Promise<void> {
    const target = item.target;
    if (target.type === 'movie') {
      const video = this.ctx.catalog.video(target.videoId);
      if (video) await this.ctx.router.push(new MovieScreen(this.ctx, video));
    } else if (target.type === 'series') {
      await this.ctx.router.push(new SeriesScreen(this.ctx, target.seriesId));
    } else if (target.type === 'liveGroup') {
      await this.ctx.router.push(new ChannelsScreen(this.ctx, target.group));
    } else {
      const video = this.ctx.catalog.video(target.videoId);
      if (video) await playVideo(this.ctx, video);
    }
  }
}
