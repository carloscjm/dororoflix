import type { AppContext } from '../app-context';
import { spinner } from '../components/ui';
import type { Channel } from '../models/media';
import type { Screen } from '../navigation/router';
import type { RemoteKey } from '../platform/keys';
import { setScreenSaver } from '../platform/tizen';
import type { EngineState, VideoEngine } from '../player/video-engine';
import { h } from '../utils/dom';

const INFO_TIMEOUT_MS = 4000;

/**
 * Player de TV ao vivo: sem barra de progresso nem histórico. CH+/CH− (ou ▲/▼)
 * trocam de canal dentro da categoria; OK mostra as informações do canal.
 * O stream (HLS/MPEG-TS) é aberto direto pela TV via AVPlay.
 */
export class LivePlayerScreen implements Screen {
  readonly name = 'live-player';
  readonly root: HTMLElement;
  private readonly videoHost = h('div', { class: 'player__video' });
  private readonly busy = h('div', { class: 'player__busy' }, spinner());
  private readonly info = h('div', { class: 'live-info' });
  private readonly message = h('div', { class: 'live-message' });
  private engine: VideoEngine | null = null;
  private infoTimer: number | null = null;
  private loadToken = 0;
  private readonly onVisibility = (): void => {
    if (document.hidden) this.engine?.suspend();
    else void this.tune(this.index);
  };

  constructor(
    private readonly ctx: AppContext,
    private readonly channels: readonly Channel[],
    private index: number,
  ) {
    this.message.hidden = true;
    this.root = h('div', { class: 'screen player live' }, this.videoHost, this.busy, this.info, this.message);
  }

  async mount(): Promise<void> {
    document.documentElement.classList.add('is-playing');
    document.addEventListener('visibilitychange', this.onVisibility);
    setScreenSaver(false);
    this.engine = this.ctx.createEngine(this.videoHost);
    this.engine.setListener({
      onStateChange: (state) => this.handleState(state),
      onTimeUpdate: () => undefined,
      onDurationChange: () => undefined,
      onError: (error) => this.showMessage(`Canal indisponível: ${error.message}`),
    });
    await this.tune(this.index);
  }

  onKey(key: RemoteKey): boolean {
    switch (key) {
      case 'channelUp':
      case 'up':
        void this.tune((this.index + 1) % this.channels.length);
        return true;
      case 'channelDown':
      case 'down':
        void this.tune((this.index - 1 + this.channels.length) % this.channels.length);
        return true;
      case 'playPause':
        if (this.engine?.state() === 'paused') this.engine.play();
        else this.engine?.pause();
        return true;
      case 'enter':
      case 'info':
      case 'left':
      case 'right':
        this.showInfo();
        return true;
      case 'back':
      case 'stop':
        this.ctx.router.back();
        return true;
      default:
        return true; // nenhuma navegação de foco nesta tela
    }
  }

  destroy(): void {
    this.loadToken++;
    if (this.infoTimer !== null) window.clearTimeout(this.infoTimer);
    this.engine?.destroy();
    this.engine = null;
    document.documentElement.classList.remove('is-playing');
    document.removeEventListener('visibilitychange', this.onVisibility);
    setScreenSaver(true);
  }

  private async tune(index: number): Promise<void> {
    const channel = this.channels[index];
    if (!channel || !this.engine) return;
    this.index = index;
    const token = ++this.loadToken;
    this.message.hidden = true;
    this.busy.hidden = false;
    this.showInfo();
    try {
      await this.engine.load(channel.url, 0);
    } catch {
      // erro já exibido por onError; o usuário pode trocar de canal
    }
    if (token !== this.loadToken) return; // trocou de canal enquanto carregava
  }

  private handleState(state: EngineState): void {
    this.busy.hidden = !(state === 'loading' || state === 'buffering');
    if (state === 'ended') this.showMessage('A transmissão terminou.');
  }

  private showInfo(): void {
    const channel = this.channels[this.index];
    if (!channel) return;
    this.info.textContent = '';
    this.info.append(
      h('div', { class: 'live-info__number' }, String(this.index + 1)),
      h(
        'div',
        {},
        h('div', { class: 'live-info__badge' }, 'AO VIVO'),
        h('div', { class: 'live-info__name' }, channel.name),
        h('div', { class: 'live-info__hint' }, `${channel.group} · CH+/CH− ou ▲/▼ trocam de canal`),
      ),
    );
    this.info.classList.add('live-info--visible');
    if (this.infoTimer !== null) window.clearTimeout(this.infoTimer);
    this.infoTimer = window.setTimeout(() => this.info.classList.remove('live-info--visible'), INFO_TIMEOUT_MS);
  }

  private showMessage(text: string): void {
    this.busy.hidden = true;
    this.message.textContent = text;
    this.message.hidden = false;
  }
}
