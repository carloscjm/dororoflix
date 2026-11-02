/**
 * Tipos mínimos das APIs Samsung/Tizen usadas pelo app.
 * Referências: Samsung AVPlay API e Tizen TV Input Device API.
 */

interface AVPlayListener {
  onbufferingstart?: () => void;
  onbufferingprogress?: (percent: number) => void;
  onbufferingcomplete?: () => void;
  oncurrentplaytime?: (currentTimeMs: number) => void;
  onstreamcompleted?: () => void;
  onevent?: (eventType: string, eventData: string) => void;
  onerror?: (eventType: string) => void;
  onsubtitlechange?: (duration: number, text: string, dataSize: number, jsonString: string) => void;
}

type AVPlayState = 'NONE' | 'IDLE' | 'READY' | 'PLAYING' | 'PAUSED';

interface AVPlayManager {
  open(url: string): void;
  close(): void;
  prepareAsync(onSuccess?: () => void, onError?: (error: unknown) => void): void;
  setDisplayRect(x: number, y: number, width: number, height: number): void;
  setDisplayMethod(method: string): void;
  setListener(listener: AVPlayListener): void;
  play(): void;
  pause(): void;
  stop(): void;
  seekTo(milliseconds: number, onSuccess?: () => void, onError?: (error: unknown) => void): void;
  getCurrentTime(): number;
  getDuration(): number;
  getState(): AVPlayState;
  suspend(): void;
  restore(url?: string, resumeTimeMs?: number, prepare?: boolean): void;
  setTimeoutForBuffering?(seconds: number): void;
}

interface SamsungWebApis {
  avplay: AVPlayManager;
  productinfo?: { getFirmware(): string; getModel(): string };
}

interface TizenApplication {
  exit(): void;
  hide(): void;
}

interface TizenGlobal {
  application: { getCurrentApplication(): TizenApplication };
  tvinputdevice?: {
    registerKey(keyName: string): void;
    registerKeyBatch?(keyNames: readonly string[], onSuccess?: () => void, onError?: (error: unknown) => void): void;
  };
  systeminfo?: { getCapability(key: string): unknown };
}

declare const webapis: SamsungWebApis | undefined;
declare const tizen: TizenGlobal | undefined;
