import type { Subtitle } from '../models/media';
import { parseVtt, type Cue } from './vtt-parser';

/**
 * Escolhe a legenda inicial conforme a preferência salva:
 * idioma exato (pt-BR) → mesmo idioma base (pt) → única legenda sem idioma
 * identificado. Legendas forçadas só são escolhidas se não houver outra.
 */
export function chooseSubtitle(tracks: readonly Subtitle[], preference: string): Subtitle | null {
  if (preference === 'off' || tracks.length === 0) return null;
  const wanted = preference.toLowerCase();
  const base = wanted.split('-')[0] ?? wanted;
  const ordered = [...tracks].sort((a, b) => Number(a.forced) - Number(b.forced));

  const exact = ordered.find((track) => track.language?.toLowerCase() === wanted);
  if (exact) return exact;
  const sameBase = ordered.find((track) => (track.language?.toLowerCase().split('-')[0] ?? '') === base);
  if (sameBase) return sameBase;
  const unknown = tracks.filter((track) => track.language === null);
  if (unknown.length === 1 && tracks.length === 1) return unknown[0] ?? null;
  return null;
}

/** Preferência a salvar quando o usuário escolhe uma legenda no menu. */
export function preferenceFor(track: Subtitle | null, current: string): string {
  if (track === null) return 'off';
  return track.language ?? current;
}

export type SubtitleLoader = (url: string) => Promise<string>;

/** Baixa e interpreta legendas, com cache por URL durante a sessão do player. */
export class SubtitleService {
  private readonly cache = new Map<string, Promise<Cue[]>>();

  constructor(private readonly load: SubtitleLoader) {}

  cues(track: Subtitle): Promise<Cue[]> {
    let pending = this.cache.get(track.url);
    if (!pending) {
      pending = this.load(track.url).then(parseVtt);
      pending.catch(() => this.cache.delete(track.url)); // erro não fica em cache
      this.cache.set(track.url, pending);
    }
    return pending;
  }
}
