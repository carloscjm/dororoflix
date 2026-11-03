import { NOOP_LISTENER, PlayerError, type AudioTrack, type EngineListener, type EngineState, type VideoEngine } from './video-engine';

/**
 * Motor baseado no Samsung AVPlay.
 *
 * O vídeo é desenhado pelo hardware atrás da página: a tela do player deixa o
 * fundo transparente e mantém um <object type="application/avplayer"> no DOM.
 * Legendas externas NÃO passam pelo AVPlay (setExternalSubtitlePath exige
 * arquivo local na TV); o app as desenha por cima, sincronizadas por getCurrentTime().
 */
export class AvplayEngine implements VideoEngine {
  readonly kind = 'avplay' as const;
  private listener: EngineListener = NOOP_LISTENER;
  private currentState: EngineState = 'idle';
  private url: string | null = null;
  private lastPositionMs = 0;
  private durationMs = 0;
  private wasPlayingBeforeSuspend = false;

  constructor(
    private readonly avplay: AVPlayManager,
    private readonly displayRect = { x: 0, y: 0, width: 1920, height: 1080 },
  ) {}

  setListener(listener: EngineListener): void {
    this.listener = listener;
  }

  load(url: string, startAtSec: number): Promise<void> {
    this.url = url;
    this.setState('loading');
    return new Promise((resolve, reject) => {
      try {
        this.closeQuietly();
        this.avplay.open(url);
        this.avplay.setDisplayRect(this.displayRect.x, this.displayRect.y, this.displayRect.width, this.displayRect.height);
        this.avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');
        this.avplay.setListener(this.buildListener());
        this.avplay.setTimeoutForBuffering?.(30);
      } catch (error) {
        const failure = toPlayerError(error, 'open');
        this.fail(failure);
        reject(failure);
        return;
      }

      this.avplay.prepareAsync(
        () => {
          this.readDuration();
          const start = (): void => {
            try {
              this.avplay.play();
              this.setState('playing');
              resolve();
            } catch (error) {
              const failure = toPlayerError(error, 'play');
              this.fail(failure);
              reject(failure);
            }
          };
          if (startAtSec > 1) {
            this.lastPositionMs = startAtSec * 1000;
            // Se o seek inicial falhar, toca do começo em vez de travar.
            this.avplay.seekTo(Math.floor(startAtSec * 1000), start, start);
          } else {
            start();
          }
        },
        (error) => {
          const failure = toPlayerError(error, 'prepare');
          this.fail(failure);
          reject(failure);
        },
      );
    });
  }

  play(): void {
    if (this.currentState === 'paused' || this.currentState === 'ended') {
      this.avplay.play();
      this.setState('playing');
    }
  }

  pause(): void {
    if (this.currentState === 'playing' || this.currentState === 'buffering') {
      this.avplay.pause();
      this.setState('paused');
    }
  }

  seek(positionSec: number): void {
    const duration = this.duration();
    const target = Math.max(0, duration === null ? positionSec : Math.min(positionSec, duration - 1));
    this.lastPositionMs = target * 1000;
    this.listener.onTimeUpdate(target);
    try {
      this.avplay.seekTo(
        Math.floor(target * 1000),
        () => undefined,
        (error) => this.listener.onError(toPlayerError(error, 'seek')),
      );
    } catch (error) {
      this.listener.onError(toPlayerError(error, 'seek'));
    }
  }

  currentTime(): number {
    try {
      const ms = this.avplay.getCurrentTime();
      if (Number.isFinite(ms) && ms > 0) this.lastPositionMs = ms;
    } catch {
      // fora dos estados READY/PLAYING/PAUSED: usa o último valor conhecido
    }
    return this.lastPositionMs / 1000;
  }

  duration(): number | null {
    if (this.durationMs <= 0) this.readDuration();
    return this.durationMs > 0 ? this.durationMs / 1000 : null;
  }

  state(): EngineState {
    return this.currentState;
  }

  audioTracks(): AudioTrack[] {
    try {
      const active = (this.avplay.getCurrentStreamInfo?.() ?? []).find((track) => track.type === 'AUDIO')?.index;
      return this.avplay
        .getTotalTrackInfo()
        .filter((track) => track.type === 'AUDIO')
        .map((track) => {
          const info = parseExtraInfo(track.extra_info);
          const channels = Number(info['channels']);
          return {
            index: track.index,
            language: typeof info['language'] === 'string' && info['language'] !== '' ? info['language'] : null,
            codec: typeof info['fourCC'] === 'string' && info['fourCC'] !== '' ? info['fourCC'] : null,
            channels: Number.isFinite(channels) && channels > 0 ? channels : null,
            active: track.index === active,
          };
        });
    } catch {
      return [];
    }
  }

  selectAudioTrack(index: number): void {
    try {
      this.avplay.setSelectTrack?.('AUDIO', index);
    } catch (error) {
      this.listener.onError(toPlayerError(error, 'audio'));
    }
  }

  suspend(): void {
    this.wasPlayingBeforeSuspend = this.currentState === 'playing';
    try {
      this.avplay.suspend();
    } catch {
      this.pause();
    }
  }

  restore(): void {
    try {
      this.avplay.restore();
      // Depois de voltar, deixa pausado: o usuário decide quando continuar.
      if (this.wasPlayingBeforeSuspend) this.pause();
    } catch {
      if (this.url) void this.load(this.url, this.lastPositionMs / 1000).then(() => this.pause(), () => undefined);
    }
  }

  destroy(): void {
    this.closeQuietly();
    this.listener = NOOP_LISTENER;
    this.currentState = 'idle';
  }

  private buildListener(): AVPlayListener {
    return {
      onbufferingstart: () => this.setState('buffering'),
      onbufferingcomplete: () => {
        this.setState(this.avplay.getState() === 'PAUSED' ? 'paused' : 'playing');
      },
      oncurrentplaytime: (ms) => {
        this.lastPositionMs = ms;
        if (this.currentState === 'buffering' || this.currentState === 'loading') this.setState('playing');
        this.listener.onTimeUpdate(ms / 1000);
      },
      onstreamcompleted: () => {
        this.lastPositionMs = this.durationMs || this.lastPositionMs;
        try {
          this.avplay.stop();
        } catch {
          // já parado
        }
        this.setState('ended');
      },
      onerror: (eventType) => this.fail(errorFromEvent(eventType)),
      onevent: () => undefined,
    };
  }

  private readDuration(): void {
    try {
      const ms = this.avplay.getDuration();
      if (Number.isFinite(ms) && ms > 0 && ms !== this.durationMs) {
        this.durationMs = ms;
        this.listener.onDurationChange(ms / 1000);
      }
    } catch {
      // ainda não disponível
    }
  }

  private setState(state: EngineState): void {
    if (state === this.currentState) return;
    this.currentState = state;
    this.listener.onStateChange(state);
  }

  private fail(error: PlayerError): void {
    this.setState('error');
    this.listener.onError(error);
  }

  private closeQuietly(): void {
    try {
      const state = this.avplay.getState();
      if (state !== 'NONE' && state !== 'IDLE') this.avplay.stop();
      if (state !== 'NONE') this.avplay.close();
    } catch {
      // nada aberto
    }
  }
}

function toPlayerError(error: unknown, step: string): PlayerError {
  const name = typeof error === 'object' && error !== null && 'name' in error ? String((error as { name: unknown }).name) : '';
  const detail = `${step}: ${name || String(error)}`;
  if (/NOT_?SUPPORTED|UNSUPPORTED/i.test(name)) {
    return new PlayerError('unsupported', 'A TV não suporta o formato deste vídeo.', detail);
  }
  if (/NETWORK|CONNECTION|TIMEOUT/i.test(name)) {
    return new PlayerError('network', 'Falha de rede ao abrir o vídeo.', detail);
  }
  return new PlayerError('unknown', 'Não foi possível reproduzir este vídeo.', detail);
}

/** Tipos de erro do evento onerror do AVPlay. */
export function errorFromEvent(eventType: string): PlayerError {
  switch (eventType) {
    case 'PLAYER_ERROR_CONNECTION_FAILED':
    case 'PLAYER_ERROR_NETWORK':
    case 'PLAYER_ERROR_TIMEOUT':
    case 'PLAYER_ERROR_STREAMING_FAIL':
      return new PlayerError('network', 'A conexão com o servidor foi interrompida.', eventType);
    case 'PLAYER_ERROR_NOT_SUPPORTED_FILE':
    case 'PLAYER_ERROR_NOT_SUPPORTED_FORMAT':
    case 'PLAYER_ERROR_INVALID_URI':
      return new PlayerError('unsupported', 'A TV não suporta o formato deste vídeo.', eventType);
    case 'PLAYER_ERROR_INVALID_STATE':
    case 'PLAYER_ERROR_INVALID_OPERATION':
    default:
      return new PlayerError('decode', 'Ocorreu um erro durante a reprodução.', eventType);
  }
}

function parseExtraInfo(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
