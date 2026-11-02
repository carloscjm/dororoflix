import type { ProgressMeta, ProgressRecord, ProgressRepository } from '../storage/progress-repository';
import type { EngineListener, EngineState, PlayerError, VideoEngine } from './video-engine';

export interface Scheduler {
  setInterval(handler: () => void, ms: number): number;
  clearInterval(id: number): void;
}

export const browserScheduler: Scheduler = {
  setInterval: (handler, ms) => window.setInterval(handler, ms),
  clearInterval: (id) => window.clearInterval(id),
};

export interface PlaybackItem {
  readonly videoId: string;
  readonly url: string;
  readonly meta: ProgressMeta;
}

export interface PlaybackEvents {
  onStateChange?(state: EngineState): void;
  onTimeUpdate?(positionSec: number, durationSec: number | null): void;
  onError?(error: PlayerError): void;
  onEnded?(record: ProgressRecord | null): void;
  onSaved?(record: ProgressRecord): void;
}

export type SaveReason = 'interval' | 'pause' | 'seek' | 'stop' | 'hidden' | 'ended' | 'error' | 'switch';

/**
 * Orquestra a reprodução e o salvamento do progresso.
 *
 * Salva: a cada `saveIntervalMs` tocando, ao pausar, ao buscar, ao sair do
 * player, ao ir para segundo plano, ao terminar e ao ocorrer erro. Como a TV
 * pode ser desligada sem aviso, o salvamento periódico é a garantia principal
 * (perde-se no máximo o intervalo).
 */
export class PlaybackService {
  private item: PlaybackItem | null = null;
  private timer: number | null = null;
  /** Só grava depois que a reprodução realmente começou: um erro ao abrir não zera o histórico. */
  private started = false;
  private lastKnownPosition = 0;

  constructor(
    private readonly engine: VideoEngine,
    private readonly progress: ProgressRepository,
    private readonly events: PlaybackEvents = {},
    private readonly scheduler: Scheduler = browserScheduler,
    private readonly saveIntervalMs = 10_000,
  ) {
    const listener: EngineListener = {
      onStateChange: (state) => this.handleState(state),
      onTimeUpdate: (position) => {
        if (position > 0) this.lastKnownPosition = position;
        if (this.engine.state() === 'playing' && position > 0) this.started = true;
        this.events.onTimeUpdate?.(position, this.engine.duration());
      },
      onDurationChange: () => this.events.onTimeUpdate?.(this.engine.currentTime(), this.engine.duration()),
      onError: (error) => {
        this.save('error');
        this.events.onError?.(error);
      },
    };
    this.engine.setListener(listener);
  }

  get current(): PlaybackItem | null {
    return this.item;
  }

  get engineKind(): VideoEngine['kind'] {
    return this.engine.kind;
  }

  async start(item: PlaybackItem, startAtSec: number): Promise<void> {
    if (this.item) this.save('switch');
    this.stopTimer();
    this.item = item;
    this.started = false;
    this.lastKnownPosition = startAtSec;
    await this.engine.load(item.url, startAtSec);
    this.timer = this.scheduler.setInterval(() => {
      if (this.engine.state() === 'playing') this.save('interval');
    }, this.saveIntervalMs);
  }

  togglePlay(): void {
    const state = this.engine.state();
    if (state === 'playing' || state === 'buffering') this.engine.pause();
    else if (state === 'paused') this.engine.play();
  }

  play(): void {
    this.engine.play();
  }

  pause(): void {
    this.engine.pause();
  }

  seekBy(deltaSec: number): number {
    return this.seekTo(this.engine.currentTime() + deltaSec);
  }

  seekTo(positionSec: number): number {
    const duration = this.engine.duration();
    const target = Math.max(0, duration === null ? positionSec : Math.min(positionSec, Math.max(0, duration - 1)));
    this.engine.seek(target);
    this.lastKnownPosition = target;
    this.started = true;
    this.save('seek');
    return target;
  }

  position(): number {
    return this.engine.currentTime();
  }

  duration(): number | null {
    return this.engine.duration();
  }

  state(): EngineState {
    return this.engine.state();
  }

  /** Grava a posição atual (no-op se nada começou a tocar). */
  save(_reason: SaveReason): ProgressRecord | null {
    if (!this.item || !this.started) return null;
    const engineTime = this.engine.currentTime();
    const position = engineTime > 0 ? engineTime : this.lastKnownPosition;
    const record = this.progress.save({
      videoId: this.item.videoId,
      positionSec: position,
      durationSec: this.engine.duration(),
      meta: this.item.meta,
    });
    this.events.onSaved?.(record);
    return record;
  }

  /** App foi para segundo plano: grava e libera o decodificador. */
  suspend(): void {
    this.save('hidden');
    this.engine.suspend();
  }

  resume(): void {
    this.engine.restore();
  }

  /** Sai do player: grava e libera tudo. */
  stop(): ProgressRecord | null {
    const record = this.save('stop');
    this.stopTimer();
    this.engine.destroy();
    this.item = null;
    return record;
  }

  private handleState(state: EngineState): void {
    if (state === 'playing') this.started = this.started || this.engine.currentTime() > 0;
    if (state === 'paused') this.save('pause');
    if (state === 'ended') {
      let record: ProgressRecord | null = null;
      if (this.item) {
        record = this.progress.markWatched(this.item.videoId, this.item.meta, this.engine.duration());
        this.events.onSaved?.(record);
      }
      this.stopTimer();
      this.events.onEnded?.(record);
    }
    this.events.onStateChange?.(state);
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      this.scheduler.clearInterval(this.timer);
      this.timer = null;
    }
  }
}
