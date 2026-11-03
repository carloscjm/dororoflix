/**
 * Abstração do motor de vídeo. Na TV: Samsung AVPlay (decodificação nativa,
 * suporta MKV, AC3/E-AC3 etc.). No navegador: <video> HTML5, para desenvolver
 * e testar a interface. O resto do app só conhece esta interface.
 */

export type EngineState = 'idle' | 'loading' | 'buffering' | 'playing' | 'paused' | 'ended' | 'error';

export type PlayerErrorKind = 'network' | 'unsupported' | 'decode' | 'unknown';

export class PlayerError extends Error {
  constructor(
    readonly kind: PlayerErrorKind,
    message: string,
    readonly detail: string | null = null,
  ) {
    super(message);
    this.name = 'PlayerError';
  }
}

export interface EngineListener {
  onStateChange(state: EngineState): void;
  /** Posição atual em segundos (chamado várias vezes por segundo durante a reprodução). */
  onTimeUpdate(positionSec: number): void;
  onDurationChange(durationSec: number): void;
  onError(error: PlayerError): void;
}

export interface VideoEngine {
  readonly kind: 'avplay' | 'html5';
  setListener(listener: EngineListener): void;
  /** Abre a URL e começa a tocar a partir de `startAtSec`. */
  load(url: string, startAtSec: number): Promise<void>;
  play(): void;
  pause(): void;
  seek(positionSec: number): void;
  currentTime(): number;
  /** Duração em segundos, ou null enquanto desconhecida. */
  duration(): number | null;
  state(): EngineState;
  /** Faixas de áudio que o decodificador da TV reconhece (vazio = nenhuma compatível ou não suportado). */
  audioTracks(): AudioTrack[];
  selectAudioTrack(index: number): void;
  /** App foi para segundo plano (Home, troca de entrada, etc.). */
  suspend(): void;
  /** App voltou ao primeiro plano. */
  restore(): void;
  destroy(): void;
}

export interface AudioTrack {
  readonly index: number;
  readonly language: string | null;
  readonly codec: string | null;
  readonly channels: number | null;
  readonly active: boolean;
}

export const NOOP_LISTENER: EngineListener = {
  onStateChange: () => undefined,
  onTimeUpdate: () => undefined,
  onDurationChange: () => undefined,
  onError: () => undefined,
};
