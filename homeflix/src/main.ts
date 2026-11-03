import { MediaApi } from './api/media-api';
import { CatalogStore, type AppContext } from './app-context';
import { FocusManager } from './navigation/focus-manager';
import { OverlayManager, showDialog, showToast } from './navigation/overlays';
import { Router } from './navigation/router';
import { toRemoteKey, type RemoteKey } from './platform/keys';
import { installRemoteSimulator } from './platform/remote-simulator';
import { exitApp, getAvplay, isTizen, registerRemoteKeys } from './platform/tizen';
import { AvplayEngine } from './player/avplay-engine';
import { Html5Engine } from './player/html5-engine';
import type { VideoEngine } from './player/video-engine';
import { HomeScreen } from './screens/home-screen';
import { SettingsScreen } from './screens/settings-screen';
import { createDefaultStore } from './storage/kv-store';
import { ProgressRepository } from './storage/progress-repository';
import { SettingsRepository } from './storage/settings-repository';
import { h } from './utils/dom';
import './styles/main.css';

/** Motor de vídeo: AVPlay na TV; HTML5 no navegador (ou com ?engine=html5 para depuração). */
function createEngine(videoHost: HTMLElement): VideoEngine {
  const forceHtml5 = new URLSearchParams(window.location.search).get('engine') === 'html5';
  const avplay = forceHtml5 ? null : getAvplay();
  if (avplay) {
    videoHost.appendChild(h('object', { type: 'application/avplayer', class: 'player__avplay' }));
    return new AvplayEngine(avplay);
  }
  const video = h('video', { class: 'player__html5', playsinline: true, preload: 'auto' });
  videoHost.appendChild(video);
  return new Html5Engine(video);
}

/** Escala o layout fixo de 1920×1080 para a janela do navegador (na TV a escala é 1). */
function fitToScreen(stage: HTMLElement): void {
  const apply = (): void => {
    const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.transform = Math.abs(scale - 1) < 0.01 ? '' : `scale(${scale})`;
  };
  apply();
  window.addEventListener('resize', apply);
}

function boot(): void {
  const stage = document.getElementById('app');
  if (!stage) throw new Error('#app não encontrado');
  fitToScreen(stage);

  const screens = h('div', { class: 'screens' });
  const overlayHost = h('div', { class: 'overlay-host' });
  stage.append(screens, overlayHost);

  const store = createDefaultStore();
  const settings = new SettingsRepository(store, {
    // Na TV, o endereço pode vir pré-configurado no build; no navegador, vazio = proxy do Vite.
    serverUrl: isTizen() ? (import.meta.env.VITE_DEFAULT_SERVER_URL ?? '') : '',
    subtitleLanguage: 'pt-BR',
    watchedThreshold: 0.9,
  });
  const progress = new ProgressRepository(store, Date.now, settings.get().watchedThreshold);
  const api = new MediaApi({ baseUrl: () => settings.get().serverUrl });
  const focus = new FocusManager();
  const overlays = new OverlayManager(overlayHost, focus);

  let exitDialogOpen = false;
  const confirmExit = async (): Promise<void> => {
    if (exitDialogOpen) return;
    exitDialogOpen = true;
    const choice = await showDialog(overlays, {
      title: 'Sair do GatoFlix?',
      actions: [
        { value: 'stay', label: 'Continuar no GatoFlix', primary: true },
        { value: 'exit', label: 'Sair' },
      ],
    });
    exitDialogOpen = false;
    if (choice === 'exit') exitApp();
  };

  const router = new Router(screens, focus, () => void confirmExit());
  const ctx: AppContext = {
    api,
    catalog: new CatalogStore(api),
    progress,
    settings,
    focus,
    router,
    overlays,
    overlayHost,
    createEngine,
    toast: (message) => showToast(overlayHost, message),
  };

  const dispatch = (key: RemoteKey): void => {
    if (overlays.handleKey(key)) return;
    router.handleKey(key);
  };

  document.addEventListener('keydown', (event) => {
    const key = toRemoteKey(event);
    if (key === null) return;
    event.preventDefault(); // impede que Voltar/Backspace saia do app ou do histórico do navegador
    dispatch(key);
  });

  registerRemoteKeys();
  if (!isTizen()) installRemoteSimulator(stage.parentElement ?? document.body, dispatch);

  // Primeira execução na TV sem servidor configurado: começa pelas configurações.
  const needsSetup = isTizen() && !settings.hasServer();
  if (needsSetup) {
    const setup = new SettingsScreen(ctx, { onConnected: () => void router.reset(new HomeScreen(ctx)) });
    void router.reset(setup);
  } else {
    void router.reset(new HomeScreen(ctx));
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
