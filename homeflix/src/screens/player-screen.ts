import type { AppContext } from '../app-context';
import { button, icon, spinner } from '../components/ui';
import { nextEpisode, previousEpisode } from '../models/library';
import { isEpisode, type Episode, type Subtitle, type Video } from '../models/media';
import { showDialog, type OverlayHandle } from '../navigation/overlays';
import type { Screen } from '../navigation/router';
import type { RemoteKey } from '../platform/keys';
import { setScreenSaver } from '../platform/tizen';
import { PlaybackService } from '../player/playback-service';
import type { AudioTrack, EngineState, PlayerError } from '../player/video-engine';
import { SubtitleRenderer } from '../subtitles/subtitle-renderer';
import { chooseSubtitle, preferenceFor, SubtitleService } from '../subtitles/subtitle-service';
import { h } from '../utils/dom';
import { displayTitle, episodeCode, formatDuration, formatTime } from '../utils/format';

const CONTROLS_TIMEOUT_MS = 5000;
const SEEK_STEP = 10;
const SEEK_STEP_FAST = 30;
const SEEK_COMMIT_DELAY_MS = 600;
const NEXT_EPISODE_COUNTDOWN = 15;

/** Título exibido de um vídeo (série + episódio, ou filme sem ruído de release). */
export function videoHeading(video: Video): { title: string; subtitle: string } {
  if (isEpisode(video)) {
    const code = episodeCode(video.media.season, video.media.episode);
    return {
      title: video.media.seriesTitle,
      subtitle: video.media.episodeTitle ? `${code} · ${video.media.episodeTitle}` : code,
    };
  }
  return { title: displayTitle(video.title), subtitle: '' };
}

export interface PlayOptions {
  /** Ignora o histórico e começa do zero. */
  readonly fromStart?: boolean;
  /** Retoma direto, sem perguntar (ex.: botão "Continuar"). */
  readonly resume?: boolean;
  /** Troca o player atual em vez de empilhar outro. */
  readonly replace?: boolean;
}

/**
 * Abre o player. Se o vídeo estiver pela metade, pergunta se continua de onde
 * parou ou começa do início (a menos que `resume`/`fromStart` já decidam).
 */
export async function playVideo(ctx: AppContext, video: Video, options: PlayOptions = {}): Promise<void> {
  const record = ctx.progress.get(video.id);
  let startAt = 0;
  if (!options.fromStart && ctx.progress.isInProgress(record)) {
    if (options.resume) {
      startAt = record.positionSec;
    } else {
      const heading = videoHeading(video);
      const choice = await showDialog(ctx.overlays, {
        title: heading.subtitle ? `${heading.title} — ${heading.subtitle}` : heading.title,
        message: `Você parou em ${formatDuration(record.positionSec)}.`,
        actions: [
          { value: 'resume', label: `Continuar de ${formatTime(record.positionSec)}`, primary: true },
          { value: 'start', label: 'Começar do início' },
        ],
      });
      if (choice === null) return;
      startAt = choice === 'resume' ? record.positionSec : 0;
    }
  }
  const screen = new PlayerScreen(ctx, video, startAt);
  if (options.replace) await ctx.router.replace(screen);
  else await ctx.router.push(screen);
}

export class PlayerScreen implements Screen {
  readonly name = 'player';
  readonly root: HTMLElement;

  private readonly videoHost = h('div', { class: 'player__video' });
  private readonly subtitleLayer = h('div', { class: 'player__subtitles' });
  private readonly busy = h('div', { class: 'player__busy' }, spinner());
  private readonly controls: HTMLElement;
  private readonly seekbar: HTMLElement;
  private readonly seekFill = h('div', { class: 'seekbar__fill' });
  private readonly seekKnob = h('div', { class: 'seekbar__knob' });
  private readonly timeCurrent = h('span', { class: 'player__time' }, '0:00');
  private readonly timeTotal = h('span', { class: 'player__time player__time--total' }, '--:--');
  private readonly playButton: HTMLElement;
  private readonly subtitleButton: HTMLElement;
  private readonly audioButton: HTMLElement;
  private audioChecked = false;

  private playback: PlaybackService | null = null;
  private readonly renderer: SubtitleRenderer;
  private readonly subtitles: SubtitleService;
  private activeSubtitle: Subtitle | null = null;
  private readonly episodes: Episode[];

  private hideTimer: number | null = null;
  private tickTimer: number | null = null;
  private seekTimer: number | null = null;
  private pendingSeek: number | null = null;
  private exiting = false;
  private menu: OverlayHandle | null = null;
  private readonly onVisibility = (): void => this.handleVisibility();
  private readonly onPageHide = (): void => void this.playback?.save('stop');

  constructor(
    private readonly ctx: AppContext,
    private readonly video: Video,
    private readonly startAt: number,
  ) {
    this.episodes = isEpisode(video) ? ctx.catalog.episodesOf(video.media.seriesId) : [];
    this.renderer = new SubtitleRenderer(this.subtitleLayer);
    this.subtitles = new SubtitleService((url) => ctx.api.subtitleText(url));

    const heading = videoHeading(video);
    this.seekbar = h(
      'div',
      { class: 'seekbar', 'data-focusable': true, 'data-key': 'seekbar', role: 'slider', 'aria-label': 'Posição' },
      h('div', { class: 'seekbar__track' }, this.seekFill),
      this.seekKnob,
    );
    this.playButton = button('', { icon: 'pause', key: 'play', className: 'button--icon', onClick: () => this.togglePlay() });
    this.subtitleButton = button('Legendas', { icon: 'subtitles', key: 'subtitles', onClick: () => this.openSubtitleMenu() });
    this.audioButton = button('Áudio', { icon: 'audio', key: 'audio', onClick: () => this.openAudioMenu() });

    const next = isEpisode(video) ? nextEpisode(this.episodes, video.id) : null;
    const previous = isEpisode(video) ? previousEpisode(this.episodes, video.id) : null;

    const buttons = [
      button('', { icon: 'rewind', key: 'rewind', className: 'button--icon', onClick: () => this.seekBy(-SEEK_STEP) }),
      this.playButton,
      button('', { icon: 'forward', key: 'forward', className: 'button--icon', onClick: () => this.seekBy(SEEK_STEP) }),
      this.subtitleButton,
      this.audioButton,
      this.episodes.length > 1 ? button('Episódios', { icon: 'episodes', key: 'episodes', onClick: () => this.openEpisodesMenu() }) : null,
      previous ? button('Anterior', { icon: 'rewind', key: 'previous', onClick: () => void this.switchTo(previous) }) : null,
      next ? button('Próximo episódio', { icon: 'next', key: 'next', onClick: () => void this.switchTo(next) }) : null,
      button('Do início', { icon: 'restart', key: 'restart', onClick: () => this.restart() }),
    ].filter((item): item is HTMLElement => item !== null);

    this.controls = h(
      'div',
      { class: 'player__controls' },
      h('div', { class: 'player__heading' }, h('div', { class: 'player__title' }, heading.title), heading.subtitle ? h('div', { class: 'player__subtitle' }, heading.subtitle) : null),
      h(
        'div',
        { class: 'player__bottom' },
        h('div', { class: 'player__timeline', 'data-focus-group': 'seek', 'data-orientation': 'horizontal' }, this.timeCurrent, this.seekbar, this.timeTotal),
        h('div', { class: 'player__buttons', 'data-focus-group': 'controls', 'data-orientation': 'horizontal' }, buttons),
      ),
    );

    this.root = h('div', { class: 'screen player' }, this.videoHost, this.subtitleLayer, this.busy, this.controls);
  }

  async mount(): Promise<void> {
    document.documentElement.classList.add('is-playing');
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onPageHide);
    setScreenSaver(false);

    const engine = this.ctx.createEngine(this.videoHost);
    this.playback = new PlaybackService(engine, this.ctx.progress, {
      onStateChange: (state) => this.handleState(state),
      onTimeUpdate: (position, duration) => this.renderTime(position, duration),
      onError: (error) => void this.handleError(error),
      onEnded: () => void this.handleEnded(),
    });

    this.showControls();
    this.ctx.focus.focus(this.playButton);
    this.tickTimer = window.setInterval(() => this.tick(), 250);
    void this.loadInitialSubtitle();

    try {
      await this.playback.start(
        {
          videoId: this.video.id,
          url: this.ctx.api.resolve(this.video.streamUrl),
          meta: progressMeta(this.video),
        },
        this.startAt,
      );
    } catch {
      // erro já tratado em onError (diálogo)
    }
  }

  onKey(key: RemoteKey): boolean {
    switch (key) {
      case 'playPause':
        this.togglePlay();
        return true;
      case 'play':
        this.playback?.play();
        this.showControls();
        return true;
      case 'pause':
        this.playback?.pause();
        this.showControls();
        return true;
      case 'stop':
        this.exit();
        return true;
      case 'fastForward':
        this.seekBy(SEEK_STEP_FAST);
        return true;
      case 'rewind':
        this.seekBy(-SEEK_STEP_FAST);
        return true;
      case 'back':
        this.exit();
        return true;
      case 'yellow':
        this.openSubtitleMenu();
        return true;
      default:
        break;
    }

    const visible = this.controlsVisible();
    if (!visible) {
      if (key === 'left' || key === 'right') {
        this.seekBy(key === 'left' ? -SEEK_STEP : SEEK_STEP);
        this.ctx.focus.focus(this.seekbar);
        return true;
      }
      if (key === 'enter') {
        this.togglePlay();
        return true;
      }
      this.showControls();
      return true;
    }

    this.showControls(); // qualquer tecla reinicia o tempo para esconder
    if ((key === 'left' || key === 'right') && this.ctx.focus.current() === this.seekbar) {
      this.seekBy(key === 'left' ? -SEEK_STEP : SEEK_STEP);
      return true;
    }
    return false; // navegação padrão entre barra e botões
  }

  destroy(): void {
    this.exiting = true;
    this.clearTimers();
    this.menu?.close();
    this.playback?.stop();
    this.playback = null;
    document.documentElement.classList.remove('is-playing');
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.onPageHide);
    setScreenSaver(true);
  }

  // ---- reprodução ----

  private togglePlay(): void {
    this.playback?.togglePlay();
    this.showControls();
  }

  private restart(): void {
    this.pendingSeek = null;
    this.playback?.seekTo(0);
    this.playback?.play();
    this.renderer.update(0);
    this.showControls();
  }

  /** Acumula toques rápidos e só manda um seek ao player depois de uma pausa curta. */
  private seekBy(delta: number): void {
    const playback = this.playback;
    if (!playback) return;
    const duration = playback.duration();
    const base = this.pendingSeek ?? playback.position();
    const target = Math.max(0, duration === null ? base + delta : Math.min(base + delta, duration - 1));
    this.pendingSeek = target;
    this.renderTime(target, duration);
    this.showControls();
    if (this.seekTimer !== null) window.clearTimeout(this.seekTimer);
    this.seekTimer = window.setTimeout(() => {
      this.seekTimer = null;
      if (this.pendingSeek === null || !this.playback) return;
      const committed = this.playback.seekTo(this.pendingSeek);
      this.pendingSeek = null;
      this.renderer.update(committed);
    }, SEEK_COMMIT_DELAY_MS);
  }

  private tick(): void {
    const playback = this.playback;
    if (!playback || this.pendingSeek !== null) return;
    const position = playback.position();
    this.renderer.update(position);
    this.renderTime(position, playback.duration());
  }

  private renderTime(position: number, duration: number | null): void {
    const shown = this.pendingSeek ?? position;
    this.timeCurrent.textContent = formatTime(shown);
    this.timeTotal.textContent = duration === null ? '--:--' : formatTime(duration);
    const fraction = duration ? Math.min(1, shown / duration) : 0;
    this.seekFill.style.width = `${fraction * 100}%`;
    this.seekKnob.style.left = `${fraction * 100}%`;
  }

  private handleState(state: EngineState): void {
    this.busy.hidden = !(state === 'loading' || state === 'buffering');
    this.root.classList.toggle('player--paused', state === 'paused');
    const playIcon = this.playButton.querySelector('svg');
    if (playIcon) playIcon.replaceWith(icon(state === 'playing' || state === 'buffering' ? 'pause' : 'play'));
    if (state === 'paused') this.showControls(true);
    else if (state === 'playing') this.scheduleHide();
    if (state === 'playing' && !this.audioChecked) {
      this.audioChecked = true;
      // O AVPlay só lista faixas que a TV decodifica: nenhuma = arquivo mudo (ex.: áudio DTS).
      window.setTimeout(() => {
        if (this.playback?.engineKind === 'avplay' && this.playback.audioTracks().length === 0) {
          this.ctx.toast('Este arquivo não tem áudio compatível com a TV (ex.: DTS). Converta o áudio de uma cópia para AC-3 ou AAC.');
        }
      }, 2000);
    }
  }

  private async handleError(error: PlayerError): Promise<void> {
    if (this.exiting) return;
    this.busy.hidden = true;
    const hint =
      error.kind === 'network'
        ? ' Verifique se o servidor no PC continua ligado.'
        : error.kind === 'unsupported'
          ? ' O contêiner ou o codec (vídeo/áudio) não é suportado por este aparelho.'
          : '';
    const choice = await showDialog(this.ctx.overlays, {
      title: 'Não foi possível reproduzir',
      message: `${error.message}${hint}${error.detail ? ` (${error.detail})` : ''}`,
      actions: [
        { value: 'retry', label: 'Tentar novamente', primary: true },
        { value: 'exit', label: 'Voltar' },
      ],
    });
    if (this.exiting) return;
    if (choice === 'retry') {
      const position = this.playback?.position() ?? this.startAt;
      await playVideo(this.ctx, this.video, { replace: true, resume: true, fromStart: position < 1 });
    } else {
      this.exit();
    }
  }

  private async handleEnded(): Promise<void> {
    if (this.exiting) return;
    const next = isEpisode(this.video) ? nextEpisode(this.episodes, this.video.id) : null;
    if (!next) {
      this.exit();
      return;
    }

    let remaining = NEXT_EPISODE_COUNTDOWN;
    const countdown = h('span', { class: 'next-panel__countdown' }, String(remaining));
    let handle: OverlayHandle | null = null;
    let timer: number | null = null;
    const finish = (action: 'next' | 'exit'): void => {
      if (timer !== null) window.clearInterval(timer);
      handle?.close();
      if (action === 'next') void this.switchTo(next, true);
      else this.exit();
    };
    const heading = videoHeading(next);
    const panel = h(
      'div',
      { class: 'overlay overlay--next' },
      h(
        'div',
        { class: 'next-panel' },
        h('div', { class: 'next-panel__label' }, 'Próximo episódio em ', countdown, 's'),
        h('div', { class: 'next-panel__title' }, heading.subtitle),
        h(
          'div',
          { class: 'next-panel__actions', 'data-focus-group': 'next-actions', 'data-orientation': 'horizontal' },
          button('Assistir agora', { icon: 'play', primary: true, key: 'next-now', onClick: () => finish('next') }),
          button('Voltar ao catálogo', { key: 'next-exit', onClick: () => finish('exit') }),
        ),
      ),
    );
    handle = this.ctx.overlays.open(panel, { onBack: () => finish('exit') });
    timer = window.setInterval(() => {
      remaining -= 1;
      countdown.textContent = String(remaining);
      if (remaining <= 0) finish('next');
    }, 1000);
  }

  private async switchTo(episode: Episode, autoplayNext = false): Promise<void> {
    this.playback?.save('switch');
    // Ao avançar automaticamente, o próximo episódio começa do início se já foi visto.
    await playVideo(this.ctx, episode, { replace: true, ...(autoplayNext ? { resume: true } : {}) });
  }

  private exit(): void {
    if (this.exiting) return;
    this.exiting = true;
    this.playback?.save('stop');
    this.ctx.router.back();
  }

  private handleVisibility(): void {
    if (document.hidden) this.playback?.suspend();
    else {
      this.playback?.resume();
      this.showControls(true);
    }
  }

  // ---- legendas ----

  private async loadInitialSubtitle(): Promise<void> {
    const preference = this.ctx.settings.get().subtitleLanguage;
    await this.selectSubtitle(chooseSubtitle(this.video.subtitles, preference), false);
  }

  private async selectSubtitle(track: Subtitle | null, remember: boolean): Promise<void> {
    this.activeSubtitle = track;
    this.updateSubtitleButton();
    if (remember) {
      const current = this.ctx.settings.get().subtitleLanguage;
      this.ctx.settings.update({ subtitleLanguage: preferenceFor(track, current) });
    }
    if (!track) {
      this.renderer.setCues(null);
      return;
    }
    try {
      const cues = await this.subtitles.cues(track);
      if (this.activeSubtitle !== track) return; // usuário trocou enquanto carregava
      this.renderer.setCues(cues);
      this.renderer.update(this.playback?.position() ?? 0);
    } catch {
      if (this.activeSubtitle !== track) return;
      this.activeSubtitle = null;
      this.renderer.setCues(null);
      this.updateSubtitleButton();
      this.ctx.toast(`Não foi possível carregar a legenda "${track.label}". O arquivo pode estar corrompido ou em formato inválido.`);
    }
  }

  private updateSubtitleButton(): void {
    const label = this.subtitleButton.querySelector('.button__label');
    if (label) label.textContent = this.activeSubtitle ? `Legenda: ${this.activeSubtitle.label}` : 'Legendas: desativadas';
  }

  private openAudioMenu(): void {
    if (this.menu) return;
    const tracks = this.playback?.audioTracks() ?? [];
    const items = tracks.map((track, position) =>
      h(
        'div',
        {
          class: `menu__item${track.active ? ' menu__item--selected' : ''}`,
          'data-focusable': true,
          'data-key': `audio-${track.index}`,
          role: 'menuitemradio',
          onclick: () => {
            this.closeMenu();
            this.playback?.selectAudioTrack(track.index);
            this.ctx.toast(`Áudio: ${audioTrackLabel(track, position)}`);
          },
        },
        icon('check', 'icon menu__check'),
        h('span', {}, audioTrackLabel(track, position)),
      ),
    );
    const selected = items[tracks.findIndex((track) => track.active)] ?? items[0] ?? null;
    const panel = h(
      'div',
      { class: 'overlay overlay--side' },
      h(
        'div',
        { class: 'menu' },
        h('h2', { class: 'menu__title' }, 'Áudio'),
        tracks.length === 0
          ? h('p', { class: 'menu__empty' }, this.playback?.engineKind === 'avplay'
              ? 'Nenhuma faixa de áudio compatível com a TV neste arquivo (ex.: DTS).'
              : 'A troca de faixa de áudio só está disponível na TV.')
          : null,
        h('div', { class: 'menu__list', 'data-focus-group': 'audio-menu', 'data-orientation': 'vertical', 'data-scroll-y': 'nearest', 'data-scroll-pad': '24' }, items),
      ),
    );
    this.menu = this.ctx.overlays.open(panel, { initialFocus: selected, onBack: () => this.closeMenu() });
    this.showControls(true);
  }

  private openSubtitleMenu(): void {
    if (this.menu) return;
    const options: (Subtitle | null)[] = [null, ...this.video.subtitles];
    const items = options.map((track) =>
      h(
        'div',
        {
          class: `menu__item${track === this.activeSubtitle ? ' menu__item--selected' : ''}`,
          'data-focusable': true,
          'data-key': track?.id ?? 'off',
          role: 'menuitemradio',
          onclick: () => {
            this.closeMenu();
            void this.selectSubtitle(track, true);
          },
        },
        icon('check', 'icon menu__check'),
        h('span', {}, track ? track.label : 'Desativadas'),
      ),
    );
    const selected = items[options.indexOf(this.activeSubtitle)] ?? items[0] ?? null;
    const panel = h(
      'div',
      { class: 'overlay overlay--side' },
      h(
        'div',
        { class: 'menu' },
        h('h2', { class: 'menu__title' }, 'Legendas'),
        this.video.subtitles.length === 0 ? h('p', { class: 'menu__empty' }, 'Nenhuma legenda encontrada na pasta deste vídeo.') : null,
        h('div', { class: 'menu__list', 'data-focus-group': 'subtitle-menu', 'data-orientation': 'vertical', 'data-scroll-y': 'nearest', 'data-scroll-pad': '24' }, items),
      ),
    );
    this.menu = this.ctx.overlays.open(panel, { initialFocus: selected, onBack: () => this.closeMenu() });
    this.showControls(true);
  }

  private openEpisodesMenu(): void {
    if (this.menu || !isEpisode(this.video)) return;
    const items = this.episodes.map((episode) => {
      const record = this.ctx.progress.get(episode.id);
      const heading = videoHeading(episode);
      return h(
        'div',
        {
          class: `menu__item${episode.id === this.video.id ? ' menu__item--selected' : ''}`,
          'data-focusable': true,
          'data-key': episode.id,
          onclick: () => {
            this.closeMenu();
            if (episode.id !== this.video.id) void this.switchTo(episode);
          },
        },
        icon('check', 'icon menu__check'),
        h('span', {}, heading.subtitle),
        record?.watched ? h('span', { class: 'menu__meta' }, 'assistido') : null,
      );
    });
    const current = items[this.episodes.findIndex((episode) => episode.id === this.video.id)] ?? null;
    const panel = h(
      'div',
      { class: 'overlay overlay--side' },
      h(
        'div',
        { class: 'menu' },
        h('h2', { class: 'menu__title' }, this.video.media.kind === 'episode' ? this.video.media.seriesTitle : 'Episódios'),
        h('div', { class: 'menu__list', 'data-focus-group': 'episodes-menu', 'data-orientation': 'vertical', 'data-scroll-y': 'nearest', 'data-scroll-pad': '24' }, items),
      ),
    );
    this.menu = this.ctx.overlays.open(panel, { initialFocus: current, onBack: () => this.closeMenu() });
    this.showControls(true);
  }

  private closeMenu(): void {
    this.menu?.close();
    this.menu = null;
    this.showControls();
  }

  // ---- controles na tela ----

  private controlsVisible(): boolean {
    return this.root.classList.contains('player--controls');
  }

  private showControls(sticky = false): void {
    this.root.classList.add('player--controls');
    if (sticky) this.clearHideTimer();
    else this.scheduleHide();
  }

  private scheduleHide(): void {
    this.clearHideTimer();
    this.hideTimer = window.setTimeout(() => {
      if (this.playback?.state() === 'playing' && !this.menu && !this.ctx.overlays.isOpen) {
        this.root.classList.remove('player--controls');
      }
    }, CONTROLS_TIMEOUT_MS);
  }

  private clearHideTimer(): void {
    if (this.hideTimer !== null) window.clearTimeout(this.hideTimer);
    this.hideTimer = null;
  }

  private clearTimers(): void {
    this.clearHideTimer();
    if (this.tickTimer !== null) window.clearInterval(this.tickTimer);
    if (this.seekTimer !== null) window.clearTimeout(this.seekTimer);
    this.tickTimer = null;
    this.seekTimer = null;
  }
}

export function progressMeta(video: Video) {
  return isEpisode(video)
    ? { title: video.media.seriesTitle, seriesId: video.media.seriesId, season: video.media.season, episode: video.media.episode }
    : { title: video.title, seriesId: null, season: null, episode: null };
}

const LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  por: 'Português', pt: 'Português', 'pt-br': 'Português (Brasil)', pob: 'Português (Brasil)',
  eng: 'Inglês', en: 'Inglês', spa: 'Espanhol', es: 'Espanhol', fra: 'Francês', fre: 'Francês', fr: 'Francês',
  ita: 'Italiano', it: 'Italiano', deu: 'Alemão', ger: 'Alemão', de: 'Alemão', jpn: 'Japonês', ja: 'Japonês',
};

/** "Português · AC3 5.1" a partir das informações que o AVPlay expõe. */
export function audioTrackLabel(track: AudioTrack, position: number): string {
  const language = track.language ? (LANGUAGE_NAMES[track.language.toLowerCase()] ?? track.language.toUpperCase()) : `Faixa ${position + 1}`;
  const codec = track.codec ? track.codec.replace(/^audio\//, '').toUpperCase() : null;
  const channels = track.channels === 6 ? '5.1' : track.channels === 8 ? '7.1' : track.channels === 2 ? 'estéreo' : null;
  return [language, [codec, channels].filter(Boolean).join(' ')].filter((part) => part !== '').join(' · ');
}
