import type { AppContext } from '../app-context';
import { artwork, button, icon, progressBar } from '../components/ui';
import { nextEpisode, resolveContinuation, type Continuation } from '../models/library';
import type { Episode } from '../models/media';
import type { Screen } from '../navigation/router';
import { append, clear, h } from '../utils/dom';
import { episodeCode, formatBytes, formatDuration, formatTime } from '../utils/format';
import { playVideo } from './player-screen';

/** Detalhes de série: ações de continuação, temporadas (esquerda) e episódios (direita). */
export class SeriesScreen implements Screen {
  readonly name = 'series';
  readonly root: HTMLElement;
  private readonly header = h('div', { class: 'series__header' });
  private readonly seasonList = h('div', {
    class: 'series__seasons',
    'data-focus-group': 'seasons',
    'data-orientation': 'vertical',
    'data-nav-right': 'episodes',
    'data-nav-up': 'series-actions',
    'data-nav-down': 'none',
    'data-scroll-y': 'nearest',
    'data-scroll-pad': '16',
  });
  private readonly episodeList = h('div', {
    class: 'series__episodes',
    'data-focus-group': 'episodes',
    'data-orientation': 'vertical',
    'data-nav-left': 'seasons',
    'data-nav-up': 'series-actions',
    'data-nav-down': 'none',
    'data-scroll-y': 'nearest',
    'data-scroll-pad': '24',
  });
  private episodes: Episode[] = [];
  private selectedSeason: number | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly ctx: AppContext,
    private readonly seriesId: string,
  ) {
    const summary = ctx.catalog.series(seriesId);
    this.root = h(
      'div',
      { class: 'screen series' },
      artwork(summary?.title ?? 'Série', summary?.artworkUrl ?? null, (path) => ctx.api.resolve(path), 'backdrop'),
      h('div', { class: 'details__shade' }),
      h('div', { class: 'series__layout' }, this.header, h('div', { class: 'series__body' }, this.seasonList, this.episodeList)),
    );
  }

  mount(): void {
    this.episodes = this.ctx.catalog.episodesOf(this.seriesId);
    // Ao focar uma temporada, a lista de episódios ao lado já muda (sem precisar apertar OK).
    this.unsubscribe = this.ctx.focus.onFocus((element) => {
      const season = element.dataset['season'];
      if (season !== undefined && element.parentElement === this.seasonList) this.showSeason(Number(season));
    });

    const continuation = resolveContinuation(this.episodes, this.ctx.progress);
    this.selectedSeason = continuation?.episode.media.season ?? this.episodes[0]?.media.season ?? null;
    this.render();
    this.ctx.focus.focusFirst('series-actions');
  }

  onShow(): void {
    this.render();
  }

  destroy(): void {
    this.unsubscribe?.();
  }

  private render(): void {
    const summary = this.ctx.catalog.series(this.seriesId);
    const continuation = resolveContinuation(this.episodes, this.ctx.progress);
    const seasons = [...new Set(this.episodes.map((episode) => episode.media.season))];

    clear(this.header);
    append(this.header, [
      h('div', { class: 'details__kind' }, 'Série'),
      h('h1', { class: 'details__title' }, summary?.title ?? this.episodes[0]?.media.seriesTitle ?? 'Série'),
      h('div', { class: 'details__meta' }, `${seasons.length} temporada(s) · ${this.episodes.length} episódio(s)`),
      this.continuationStatus(continuation),
      this.actions(continuation),
    ]);

    clear(this.seasonList);
    for (const season of seasons) {
      const total = this.episodes.filter((episode) => episode.media.season === season);
      const watched = total.filter((episode) => this.ctx.progress.get(episode.id)?.watched).length;
      this.seasonList.appendChild(
        h(
          'div',
          {
            class: `season-item${season === this.selectedSeason ? ' season-item--selected' : ''}`,
            'data-focusable': true,
            'data-key': `season-${season}`,
            'data-season': season,
            onclick: () => {
              this.showSeason(season);
              this.ctx.focus.focusFirst('episodes');
            },
          },
          h('span', { class: 'season-item__name' }, `Temporada ${season}`),
          h('span', { class: 'season-item__count' }, `${watched}/${total.length}`),
        ),
      );
    }
    this.renderEpisodes();
  }

  private continuationStatus(continuation: Continuation | null): HTMLElement | null {
    if (!continuation) return null;
    const code = episodeCode(continuation.episode.media.season, continuation.episode.media.episode);
    const text =
      continuation.type === 'resume'
        ? `Você parou em ${code}, aos ${formatDuration(continuation.positionSec)}`
        : continuation.type === 'next'
          ? `Próximo: ${code}`
          : continuation.type === 'rewatch'
            ? 'Você já assistiu todos os episódios'
            : null;
    return text ? h('div', { class: 'details__status' }, text) : null;
  }

  private actions(continuation: Continuation | null): HTMLElement {
    const group = h('div', {
      class: 'details__actions',
      'data-focus-group': 'series-actions',
      'data-orientation': 'horizontal',
      'data-nav-down': 'seasons',
    });
    if (!continuation) return group;
    const episode = continuation.episode;
    const code = episodeCode(episode.media.season, episode.media.episode);

    if (continuation.type === 'resume') {
      group.appendChild(
        button(`Continuar ${code} (${formatTime(continuation.positionSec)})`, {
          icon: 'play',
          primary: true,
          key: 'continue',
          onClick: () => void playVideo(this.ctx, episode, { resume: true }),
        }),
      );
      const next = nextEpisode(this.episodes, episode.id);
      if (next) {
        group.appendChild(
          button(`Próximo episódio ${episodeCode(next.media.season, next.media.episode)}`, {
            icon: 'next',
            key: 'next',
            onClick: () => void playVideo(this.ctx, next),
          }),
        );
      }
    } else {
      const label = continuation.type === 'next' ? `Assistir ${code}` : continuation.type === 'rewatch' ? 'Assistir novamente' : `Assistir ${code}`;
      group.appendChild(
        button(label, { icon: 'play', primary: true, key: 'continue', onClick: () => void playVideo(this.ctx, episode, { resume: true }) }),
      );
    }
    return group;
  }

  private showSeason(season: number): void {
    if (season === this.selectedSeason) return;
    this.selectedSeason = season;
    for (const item of this.seasonList.children) {
      item.classList.toggle('season-item--selected', (item as HTMLElement).dataset['season'] === String(season));
    }
    this.ctx.focus.resetGroup(this.episodeList);
    this.episodeList.scrollTop = 0;
    this.renderEpisodes();
  }

  private renderEpisodes(): void {
    clear(this.episodeList);
    const list = this.episodes.filter((episode) => episode.media.season === this.selectedSeason);
    for (const episode of list) {
      const record = this.ctx.progress.get(episode.id);
      const inProgress = this.ctx.progress.isInProgress(record);
      const title = episode.media.episodeTitle ?? `Episódio ${episode.media.episode}`;
      this.episodeList.appendChild(
        h(
          'div',
          {
            class: `episode${record?.watched ? ' episode--watched' : ''}`,
            'data-focusable': true,
            'data-key': episode.id,
            onclick: () => void playVideo(this.ctx, episode),
          },
          h('div', { class: 'episode__number' }, String(episode.media.episode)),
          h(
            'div',
            { class: 'episode__body' },
            h('div', { class: 'episode__title' }, title),
            h(
              'div',
              { class: 'episode__meta' },
              [
                episodeCode(episode.media.season, episode.media.episode),
                formatBytes(episode.sizeBytes),
                episode.subtitles.length > 0 ? `${episode.subtitles.length} legenda(s)` : null,
                inProgress ? `parou em ${formatTime(record.positionSec)}` : null,
              ]
                .filter(Boolean)
                .join(' · '),
            ),
            inProgress ? progressBar(this.ctx.progress.fraction(record) ?? 0.02, 'episode-progress') : null,
          ),
          record?.watched ? h('div', { class: 'episode__watched', title: 'Assistido' }, icon('check')) : null,
        ),
      );
    }
  }
}
