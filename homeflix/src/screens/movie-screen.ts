import type { AppContext } from '../app-context';
import { artwork, button, progressBar } from '../components/ui';
import type { Video } from '../models/media';
import type { Screen } from '../navigation/router';
import { append, clear, h } from '../utils/dom';
import { displayTitle, formatBytes, formatDuration, formatTime, yearFromTitle } from '../utils/format';
import { playVideo, progressMeta } from './player-screen';

/** Detalhes de um filme: capa, informações do catálogo, progresso e ações. */
export class MovieScreen implements Screen {
  readonly name = 'movie';
  readonly root: HTMLElement;
  private readonly panel = h('div', { class: 'details__panel' });

  constructor(
    private readonly ctx: AppContext,
    private readonly video: Video,
  ) {
    this.root = h(
      'div',
      { class: 'screen details' },
      artwork(video.title, video.artworkUrl, (path) => ctx.api.resolve(path), 'backdrop'),
      h('div', { class: 'details__shade' }),
      this.panel,
    );
  }

  mount(): void {
    this.render();
    this.ctx.focus.focusFirst('movie-actions');
  }

  onShow(): boolean {
    this.render();
    // Voltando do player: se ficou pela metade, o foco vai direto para "Continuar".
    return this.ctx.focus.restore({ groupId: 'movie-actions', index: 0, key: 'resume' }) &&
      this.ctx.focus.current()?.dataset['key'] === 'resume';
  }

  private render(): void {
    const { progress } = this.ctx;
    const video = this.video;
    const record = progress.get(video.id);
    const watched = record?.watched === true;
    const inProgress = progress.isInProgress(record);
    const year = yearFromTitle(video.title);

    const actions = h(
      'div',
      { class: 'details__actions', 'data-focus-group': 'movie-actions', 'data-orientation': 'horizontal' },
      inProgress
        ? button(`Continuar de ${formatTime(record.positionSec)}`, {
            icon: 'play',
            primary: true,
            key: 'resume',
            onClick: () => void playVideo(this.ctx, video, { resume: true }),
          })
        : null,
      button(inProgress || watched ? 'Assistir do início' : 'Assistir', {
        icon: inProgress ? 'restart' : 'play',
        primary: !inProgress,
        key: 'play',
        onClick: () => void playVideo(this.ctx, video, { fromStart: true }),
      }),
      watched
        ? button('Marcar como não assistido', {
            icon: 'check',
            key: 'toggle-watched',
            onClick: () => {
              progress.markUnwatched(video.id);
              this.render();
            },
          })
        : button('Marcar como assistido', {
            icon: 'check',
            key: 'toggle-watched',
            onClick: () => {
              progress.markWatched(video.id, progressMeta(video));
              this.render();
            },
          }),
    );

    const facts: [string, string][] = [
      ['Arquivo', video.relativePath],
      ['Formato', `${video.format.toUpperCase()} · ${formatBytes(video.sizeBytes)}`],
      ['Adicionado em', new Date(video.modifiedAt).toLocaleDateString('pt-BR')],
      ['Legendas', video.subtitles.length > 0 ? video.subtitles.map((track) => track.label).join(', ') : 'Nenhuma na pasta'],
    ];

    let status: string | null = null;
    if (inProgress) {
      const remaining = record.durationSec ? record.durationSec - record.positionSec : null;
      status = `Parou em ${formatDuration(record.positionSec)}${remaining !== null ? ` · faltam ${formatDuration(remaining)}` : ''}`;
    } else if (watched) {
      status = 'Assistido';
    }

    const snapshot = this.ctx.focus.snapshot();
    clear(this.panel);
    append(this.panel, [
      h('div', { class: 'details__kind' }, 'Filme'),
      h('h1', { class: 'details__title' }, displayTitle(video.title)),
      h('div', { class: 'details__meta' }, [year ? String(year) : null, video.format.toUpperCase(), formatBytes(video.sizeBytes)].filter(Boolean).join(' · ')),
      inProgress ? progressBar(progress.fraction(record), 'details-progress') : null,
      status ? h('div', { class: 'details__status' }, status) : null,
      actions,
      h('dl', { class: 'details__facts' }, facts.flatMap(([term, value]) => [h('dt', {}, term), h('dd', {}, value)])),
    ]);
    if (snapshot?.groupId === 'movie-actions' && !this.ctx.focus.restore(snapshot)) this.ctx.focus.focusFirst('movie-actions');
  }
}
