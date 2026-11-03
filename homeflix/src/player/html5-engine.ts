import { NOOP_LISTENER, PlayerError, type AudioTrack, type EngineListener, type EngineState, type VideoEngine } from './video-engine';

/** Motor com <video> HTML5: usado no navegador para desenvolver e testar a interface. */
export class Html5Engine implements VideoEngine {
  readonly kind = 'html5' as const;
  private listener: EngineListener = NOOP_LISTENER;
  private currentState: EngineState = 'idle';
  private readonly abort = new AbortController();

  constructor(private readonly video: HTMLVideoElement) {
    const on = (type: string, handler: () => void): void =>
      video.addEventListener(type, handler, { signal: this.abort.signal });

    on('waiting', () => this.setState('buffering'));
    on('playing', () => this.setState('playing'));
    on('pause', () => {
      if (!video.ended) this.setState('paused');
    });
    on('ended', () => this.setState('ended'));
    on('timeupdate', () => this.listener.onTimeUpdate(video.currentTime));
    on('durationchange', () => {
      if (Number.isFinite(video.duration) && video.duration > 0) this.listener.onDurationChange(video.duration);
    });
    on('error', () => {
      const code = video.error?.code ?? 0;
      const error =
        code === 4
          ? new PlayerError('unsupported', 'O navegador não suporta o formato deste vídeo (ex.: MKV, AC3).', `MEDIA_ERR ${code}`)
          : code === 2
            ? new PlayerError('network', 'Falha de rede ao carregar o vídeo.', `MEDIA_ERR ${code}`)
            : new PlayerError('decode', 'Não foi possível reproduzir este vídeo.', `MEDIA_ERR ${code}`);
      this.setState('error');
      this.listener.onError(error);
    });
  }

  setListener(listener: EngineListener): void {
    this.listener = listener;
  }

  async load(url: string, startAtSec: number): Promise<void> {
    this.setState('loading');
    this.video.src = url;
    if (startAtSec > 1) {
      await new Promise<void>((resolve) => {
        this.video.addEventListener('loadedmetadata', () => resolve(), { once: true, signal: this.abort.signal });
        this.video.addEventListener('error', () => resolve(), { once: true, signal: this.abort.signal });
      });
      this.video.currentTime = startAtSec;
    }
    try {
      await this.video.play();
    } catch (error) {
      if (this.currentState === 'error') throw new PlayerError('unsupported', 'Não foi possível reproduzir este vídeo.');
      // Autoplay bloqueado pelo navegador: fica pausado aguardando o usuário.
      if (error instanceof DOMException && error.name === 'NotAllowedError') this.setState('paused');
      else throw new PlayerError('unknown', 'Não foi possível reproduzir este vídeo.', String(error));
    }
  }

  play(): void {
    void this.video.play().catch(() => undefined);
  }

  pause(): void {
    this.video.pause();
  }

  seek(positionSec: number): void {
    const duration = this.duration();
    this.video.currentTime = Math.max(0, duration === null ? positionSec : Math.min(positionSec, duration - 1));
    this.listener.onTimeUpdate(this.video.currentTime);
  }

  currentTime(): number {
    return this.video.currentTime;
  }

  duration(): number | null {
    return Number.isFinite(this.video.duration) && this.video.duration > 0 ? this.video.duration : null;
  }

  state(): EngineState {
    return this.currentState;
  }

  audioTracks(): AudioTrack[] {
    return []; // o <video> do navegador não expõe faixas de forma confiável
  }

  selectAudioTrack(): void {}

  suspend(): void {
    this.pause();
  }

  restore(): void {
    // continua pausado
  }

  destroy(): void {
    this.abort.abort();
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
    this.listener = NOOP_LISTENER;
  }

  private setState(state: EngineState): void {
    if (state === this.currentState) return;
    this.currentState = state;
    this.listener.onStateChange(state);
  }
}
