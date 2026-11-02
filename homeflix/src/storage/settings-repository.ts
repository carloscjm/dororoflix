import { DEFAULT_WATCHED_THRESHOLD } from './progress-repository';
import type { KeyValueStore } from './kv-store';

const SETTINGS_KEY = 'homeflix.settings.v1';

/** "off" desativa; "auto" usa a única legenda sem idioma identificado, se houver. */
export type SubtitlePreference = string;

export interface Settings {
  /** "192.168.15.165:8080" ou URL completa. Vazio = mesma origem (modo navegador). */
  readonly serverUrl: string;
  readonly subtitleLanguage: SubtitlePreference;
  readonly watchedThreshold: number;
}

export const SUBTITLE_CHOICES: readonly { readonly value: SubtitlePreference; readonly label: string }[] = [
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'en', label: 'Inglês' },
  { value: 'es', label: 'Espanhol' },
  { value: 'off', label: 'Desativadas' },
];

export const WATCHED_THRESHOLDS = [0.85, 0.9, 0.95] as const;

export class SettingsRepository {
  constructor(
    private readonly store: KeyValueStore,
    private readonly defaults: Settings = {
      serverUrl: '',
      subtitleLanguage: 'pt-BR',
      watchedThreshold: DEFAULT_WATCHED_THRESHOLD,
    },
  ) {}

  get(): Settings {
    const raw = this.store.get(SETTINGS_KEY);
    if (raw === null) return this.defaults;
    try {
      const value = JSON.parse(raw) as Partial<Settings>;
      return {
        serverUrl: typeof value.serverUrl === 'string' ? value.serverUrl : this.defaults.serverUrl,
        subtitleLanguage:
          typeof value.subtitleLanguage === 'string' ? value.subtitleLanguage : this.defaults.subtitleLanguage,
        watchedThreshold:
          typeof value.watchedThreshold === 'number' && value.watchedThreshold > 0.5 && value.watchedThreshold <= 1
            ? value.watchedThreshold
            : this.defaults.watchedThreshold,
      };
    } catch {
      return this.defaults;
    }
  }

  update(changes: Partial<Settings>): Settings {
    const next = { ...this.get(), ...changes };
    this.store.set(SETTINGS_KEY, JSON.stringify(next));
    return next;
  }

  /** Já houve configuração explícita do servidor (ou um padrão de build)? */
  hasServer(): boolean {
    return this.get().serverUrl.trim() !== '';
  }
}
