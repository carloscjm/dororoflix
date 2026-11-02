import type { Episode, SeriesSummary, Subtitle, Video } from '../src/models/media';
import { MemoryStore } from '../src/storage/kv-store';
import { ProgressRepository } from '../src/storage/progress-repository';

let counter = 0;
const nextId = (): string => (++counter).toString(16).padStart(16, '0');

export function movie(title: string, overrides: Partial<Video> = {}): Video {
  const id = overrides.id ?? nextId();
  return {
    id,
    sourceId: 'local',
    title,
    format: 'mkv',
    mimeType: 'video/x-matroska',
    sizeBytes: 1_000_000,
    relativePath: `${title}.mkv`,
    modifiedAt: '2024-01-01T00:00:00.000Z',
    streamUrl: `/api/videos/${id}/stream`,
    media: { kind: 'movie' },
    subtitles: [],
    artworkUrl: null,
    ...overrides,
  };
}

export function episode(seriesId: string, seriesTitle: string, season: number, number: number, overrides: Partial<Video> = {}): Episode {
  const id = overrides.id ?? nextId();
  return {
    ...movie(`S${season}E${number}`, { id, ...overrides }),
    relativePath: `Series/${seriesTitle}/Temporada ${season}/S0${season}E${String(number).padStart(2, '0')}.mkv`,
    media: { kind: 'episode', seriesId, seriesTitle, season, episode: number, episodeTitle: null },
  } as Episode;
}

export function seriesSummary(id: string, title: string, overrides: Partial<SeriesSummary> = {}): SeriesSummary {
  return {
    id,
    title,
    seasonCount: 1,
    episodeCount: 1,
    latestModifiedAt: '2024-01-01T00:00:00.000Z',
    artworkUrl: null,
    ...overrides,
  };
}

export function subtitle(language: string | null, overrides: Partial<Subtitle> = {}): Subtitle {
  const id = overrides.id ?? nextId();
  return {
    id,
    language,
    label: language ?? 'Legenda',
    format: 'srt',
    forced: false,
    url: `/api/videos/x/subtitles/${id}`,
    ...overrides,
  };
}

/** Repositório com relógio controlável. */
export function progressRepo(start = 1_700_000_000_000): { repo: ProgressRepository; store: MemoryStore; tick: (ms?: number) => void } {
  let now = start;
  const store = new MemoryStore();
  const repo = new ProgressRepository(store, () => now);
  return { repo, store, tick: (ms = 1000) => void (now += ms) };
}

export const META = { title: 'Filme', seriesId: null, season: null, episode: null } as const;
