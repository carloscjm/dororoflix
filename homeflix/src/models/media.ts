/**
 * Contratos da API do Home Media Server (espelham `src/routes/schemas.ts` do backend).
 */

export type MediaInfo =
  | { readonly kind: 'movie' }
  | {
      readonly kind: 'episode';
      readonly seriesId: string;
      readonly seriesTitle: string;
      readonly season: number;
      readonly episode: number;
      readonly episodeTitle: string | null;
    };

export interface Subtitle {
  readonly id: string;
  readonly language: string | null;
  readonly label: string;
  readonly format: string;
  readonly forced: boolean;
  readonly url: string;
}

export interface Video {
  readonly id: string;
  readonly sourceId: string;
  readonly title: string;
  readonly format: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly relativePath: string;
  readonly modifiedAt: string;
  readonly streamUrl: string;
  readonly media: MediaInfo;
  readonly subtitles: readonly Subtitle[];
  readonly artworkUrl: string | null;
}

export type Episode = Video & { readonly media: Extract<MediaInfo, { kind: 'episode' }> };

export interface VideoList {
  readonly total: number;
  readonly scannedAt: string | null;
  readonly items: readonly Video[];
}

export interface SeriesSummary {
  readonly id: string;
  readonly title: string;
  readonly seasonCount: number;
  readonly episodeCount: number;
  readonly latestModifiedAt: string;
  readonly artworkUrl: string | null;
}

export interface SeriesList {
  readonly total: number;
  readonly items: readonly SeriesSummary[];
}

export interface Season {
  readonly number: number;
  readonly episodes: readonly Episode[];
}

export interface SeriesDetail extends SeriesSummary {
  readonly seasons: readonly Season[];
}

export interface Health {
  readonly status: string;
  readonly uptimeSeconds: number;
  readonly catalog: { readonly total: number; readonly scannedAt: string | null };
}

export interface ScanResult {
  readonly total: number;
  readonly durationMs: number;
  readonly scannedAt: string;
}

export function isEpisode(video: Video): video is Episode {
  return video.media.kind === 'episode';
}
