/** Teclas lógicas do controle remoto, independentes de plataforma. */
export type RemoteKey =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'enter'
  | 'back'
  | 'playPause'
  | 'play'
  | 'pause'
  | 'stop'
  | 'fastForward'
  | 'rewind'
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'info'
  | `digit${number}`;

/** keyCodes do controle Samsung (Tizen TV) e dos teclados comuns. */
export const TIZEN_KEY_CODES: Readonly<Record<number, RemoteKey>> = {
  37: 'left',
  38: 'up',
  39: 'right',
  40: 'down',
  13: 'enter',
  10009: 'back', // Return/Voltar
  10252: 'playPause', // MediaPlayPause
  415: 'play', // MediaPlay
  19: 'pause', // MediaPause
  413: 'stop', // MediaStop
  417: 'fastForward', // MediaFastForward
  412: 'rewind', // MediaRewind
  403: 'red', // ColorF0Red
  404: 'green', // ColorF1Green
  405: 'yellow', // ColorF2Yellow
  406: 'blue', // ColorF3Blue
  457: 'info', // Info
};

/** Teclas registradas via tizen.tvinputdevice (as setas, Enter e Voltar não precisam). */
export const TIZEN_REGISTERED_KEYS = [
  'MediaPlayPause',
  'MediaPlay',
  'MediaPause',
  'MediaStop',
  'MediaFastForward',
  'MediaRewind',
  'ColorF0Red',
  'ColorF1Green',
  'ColorF2Yellow',
  'ColorF3Blue',
  'Info',
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
] as const;

/** Simulação no navegador: teclado do PC → teclas do controle. */
export const BROWSER_KEYS: Readonly<Record<string, RemoteKey>> = {
  Backspace: 'back',
  Escape: 'back',
  ' ': 'playPause',
  k: 'playPause',
  p: 'play',
  o: 'pause',
  s: 'stop',
  f: 'fastForward',
  '.': 'fastForward',
  r: 'rewind',
  ',': 'rewind',
  F1: 'red',
  F2: 'green',
  F3: 'yellow',
  F4: 'blue',
  i: 'info',
};

export interface KeyLike {
  readonly keyCode: number;
  readonly key: string;
}

export function toRemoteKey(event: KeyLike): RemoteKey | null {
  // Dígitos: 0-9 da linha superior (48-57), teclado numérico (96-105) e o "123" do controle.
  if (event.keyCode >= 48 && event.keyCode <= 57) return `digit${event.keyCode - 48}`;
  if (event.keyCode >= 96 && event.keyCode <= 105) return `digit${event.keyCode - 96}`;
  return TIZEN_KEY_CODES[event.keyCode] ?? BROWSER_KEYS[event.key] ?? null;
}

export function digitOf(key: RemoteKey): number | null {
  return key.startsWith('digit') ? Number(key.slice(5)) : null;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

export function isDirection(key: RemoteKey): key is Direction {
  return key === 'up' || key === 'down' || key === 'left' || key === 'right';
}
