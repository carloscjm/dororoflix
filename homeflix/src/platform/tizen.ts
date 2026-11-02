import { TIZEN_REGISTERED_KEYS } from './keys';

/** Acesso seguro às APIs globais da TV (no navegador elas não existem). */
export function getTizen(): TizenGlobal | null {
  return typeof tizen === 'undefined' ? null : tizen;
}

export function getAvplay(): AVPlayManager | null {
  return typeof webapis === 'undefined' || !webapis?.avplay ? null : webapis.avplay;
}

export function isTizen(): boolean {
  return getTizen() !== null;
}

/** Registra as teclas de mídia/cores; sem isso a TV não as entrega ao app. */
export function registerRemoteKeys(): void {
  const input = getTizen()?.tvinputdevice;
  if (!input) return;
  try {
    if (input.registerKeyBatch) {
      input.registerKeyBatch(TIZEN_REGISTERED_KEYS);
      return;
    }
  } catch {
    // alguns firmwares não têm registerKeyBatch: registra uma a uma abaixo
  }
  for (const key of TIZEN_REGISTERED_KEYS) {
    try {
      input.registerKey(key);
    } catch {
      // tecla inexistente neste modelo de controle
    }
  }
}

export function exitApp(): void {
  const app = getTizen()?.application.getCurrentApplication();
  if (app) app.exit();
  else window.close();
}

export function deviceDescription(): string {
  try {
    const info = typeof webapis === 'undefined' ? undefined : webapis?.productinfo;
    if (info) return `${info.getModel()} · firmware ${info.getFirmware()}`;
  } catch {
    // productinfo exige privilégio em alguns firmwares
  }
  return isTizen() ? 'Samsung Tizen' : 'Navegador (modo de desenvolvimento)';
}

interface AppCommon {
  setScreenSaver(state: number, onSuccess?: () => void, onError?: () => void): void;
  AppCommonScreenSaverState: { SCREEN_SAVER_OFF: number; SCREEN_SAVER_ON: number };
}

/** Evita que o protetor de tela da TV apareça durante a reprodução. */
export function setScreenSaver(enabled: boolean): void {
  try {
    const appcommon = (typeof webapis === 'undefined' ? undefined : (webapis as unknown as { appcommon?: AppCommon })?.appcommon);
    if (!appcommon) return;
    const states = appcommon.AppCommonScreenSaverState;
    appcommon.setScreenSaver(enabled ? states.SCREEN_SAVER_ON : states.SCREEN_SAVER_OFF);
  } catch {
    // indisponível neste firmware
  }
}
