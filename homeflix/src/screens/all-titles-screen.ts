import type { AppContext } from '../app-context';
import { brand, card, observeLazyImages } from '../components/ui';
import { allTitles, type CardItem } from '../models/library';
import type { Screen } from '../navigation/router';
import { clear, h } from '../utils/dom';

const COLUMNS = 6;

/** Grade com todos os filmes ou todas as séries ("Ver todos" da tela inicial). */
export class AllTitlesScreen implements Screen {
  readonly name = 'all-titles';
  readonly root: HTMLElement;
  private readonly scroll = h('div', { class: 'all-titles__scroll', 'data-scroll-y': 'nearest', 'data-scroll-pad': '80' });

  constructor(
    private readonly ctx: AppContext,
    private readonly kind: 'movies' | 'series',
    private readonly onSelect: (item: CardItem) => void,
  ) {
    this.root = h(
      'div',
      { class: 'screen all-titles' },
      h('header', { class: 'topbar' }, brand(), h('div', { class: 'topbar__title' }, kind === 'movies' ? 'Todos os filmes' : 'Todas as séries')),
      this.scroll,
    );
  }

  mount(): void {
    this.render();
    this.ctx.focus.focusFirst('all-titles');
  }

  onShow(): void {
    this.render(); // progresso/assistido podem ter mudado; o Router restaura o foco pelo data-key
  }

  private render(): void {
    const library = this.ctx.catalog.loaded;
    clear(this.scroll);
    if (!library) return;
    const grid = h(
      'div',
      { class: 'all-titles__grid', 'data-focus-group': 'all-titles', 'data-orientation': 'grid', 'data-columns': String(COLUMNS) },
      allTitles(library, this.ctx.progress, this.kind).map((item) => card(item, (path) => this.ctx.api.resolve(path), this.onSelect)),
    );
    this.scroll.appendChild(grid);
    observeLazyImages(this.scroll, 900);
  }
}
