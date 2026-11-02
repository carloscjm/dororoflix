import { SUBTITLE_FORMATS, VIDEO_FORMATS } from '../library/formats.js';
import type { ScanResult, SeriesItem, SubtitleTrack, VideoItem } from '../library/types.js';
import { VIDEO_ID_PATTERN } from '../library/video-id.js';

export type MediaDto =
  | { readonly kind: 'movie' }
  | {
      readonly kind: 'episode';
      readonly seriesId: string;
      readonly seriesTitle: string;
      readonly season: number;
      readonly episode: number;
      readonly episodeTitle: string | null;
    };

export interface SubtitleDto {
  readonly id: string;
  readonly language: string | null;
  readonly label: string;
  readonly format: string;
  readonly forced: boolean;
  /** Sempre entrega WebVTT em UTF-8, qualquer que seja o arquivo original. */
  readonly url: string;
}

/** Representação pública de um vídeo na API. */
export interface VideoDto {
  readonly id: string;
  readonly sourceId: string;
  readonly title: string;
  readonly format: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly relativePath: string;
  readonly modifiedAt: string;
  readonly streamUrl: string;
  readonly media: MediaDto;
  readonly subtitles: readonly SubtitleDto[];
  readonly artworkUrl: string | null;
}

export interface VideoListDto {
  readonly total: number;
  readonly scannedAt: string | null;
  readonly items: readonly VideoDto[];
}

export interface SeriesSummaryDto {
  readonly id: string;
  readonly title: string;
  readonly seasonCount: number;
  readonly episodeCount: number;
  readonly latestModifiedAt: string;
  readonly artworkUrl: string | null;
}

export interface SeriesDetailDto extends SeriesSummaryDto {
  readonly seasons: readonly { readonly number: number; readonly episodes: readonly VideoDto[] }[];
}

export interface SeriesListDto {
  readonly total: number;
  readonly items: readonly SeriesSummaryDto[];
}

export interface ScanResultDto {
  readonly total: number;
  readonly durationMs: number;
  readonly scannedAt: string;
}

export const toSubtitleDto = (videoId: string, track: SubtitleTrack): SubtitleDto => ({
  id: track.id,
  language: track.language,
  label: track.label,
  format: track.format,
  forced: track.forced,
  url: `/api/videos/${videoId}/subtitles/${track.id}`,
});

export const toVideoDto = (video: VideoItem): VideoDto => ({
  id: video.id,
  sourceId: video.sourceId,
  title: video.title,
  format: video.format,
  mimeType: video.mimeType,
  sizeBytes: video.sizeBytes,
  relativePath: video.relativePath,
  modifiedAt: video.modifiedAt.toISOString(),
  streamUrl: `/api/videos/${video.id}/stream`,
  media: video.media,
  subtitles: video.subtitles.map((track) => toSubtitleDto(video.id, track)),
  artworkUrl: video.artwork ? `/api/videos/${video.id}/artwork` : null,
});

export const toSeriesSummaryDto = (series: SeriesItem): SeriesSummaryDto => {
  const episodes = series.seasons.flatMap((season) => season.episodes);
  const latest = Math.max(...episodes.map((episode) => episode.modifiedAt.getTime()));
  return {
    id: series.id,
    title: series.title,
    seasonCount: series.seasons.length,
    episodeCount: episodes.length,
    latestModifiedAt: new Date(latest).toISOString(),
    artworkUrl: series.artwork ? `/api/series/${series.id}/artwork` : null,
  };
};

export const toSeriesDetailDto = (series: SeriesItem): SeriesDetailDto => ({
  ...toSeriesSummaryDto(series),
  seasons: series.seasons.map((season) => ({
    number: season.number,
    episodes: season.episodes.map(toVideoDto),
  })),
});

export const toScanResultDto = (scan: ScanResult): ScanResultDto => ({
  total: scan.total,
  durationMs: scan.durationMs,
  scannedAt: scan.scannedAt.toISOString(),
});

// ---- JSON Schemas (validação de entrada + serialização rápida de saída) ----

export const errorSchema = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: { code: { type: 'string' }, message: { type: 'string' } },
    },
  },
} as const;

export const videoIdParamsSchema = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: { id: { type: 'string', pattern: VIDEO_ID_PATTERN } },
} as const;

export const subtitleParamsSchema = {
  type: 'object',
  required: ['id', 'subtitleId'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', pattern: VIDEO_ID_PATTERN },
    subtitleId: { type: 'string', pattern: VIDEO_ID_PATTERN },
  },
} as const;

const mediaSchema = {
  type: 'object',
  required: ['kind'],
  properties: {
    kind: { type: 'string', enum: ['movie', 'episode'] },
    seriesId: { type: 'string' },
    seriesTitle: { type: 'string' },
    season: { type: 'integer' },
    episode: { type: 'integer' },
    episodeTitle: { type: ['string', 'null'] },
  },
} as const;

export const subtitleSchema = {
  type: 'object',
  required: ['id', 'language', 'label', 'format', 'forced', 'url'],
  properties: {
    id: { type: 'string' },
    language: { type: ['string', 'null'] },
    label: { type: 'string' },
    format: { type: 'string', enum: [...SUBTITLE_FORMATS] },
    forced: { type: 'boolean' },
    url: { type: 'string' },
  },
} as const;

export const videoSchema = {
  type: 'object',
  required: [
    'id',
    'sourceId',
    'title',
    'format',
    'mimeType',
    'sizeBytes',
    'relativePath',
    'modifiedAt',
    'streamUrl',
    'media',
    'subtitles',
    'artworkUrl',
  ],
  properties: {
    id: { type: 'string' },
    sourceId: { type: 'string' },
    title: { type: 'string' },
    format: { type: 'string', enum: Object.keys(VIDEO_FORMATS) },
    mimeType: { type: 'string' },
    sizeBytes: { type: 'integer' },
    relativePath: { type: 'string' },
    modifiedAt: { type: 'string', format: 'date-time' },
    streamUrl: { type: 'string' },
    media: mediaSchema,
    subtitles: { type: 'array', items: subtitleSchema },
    artworkUrl: { type: ['string', 'null'] },
  },
} as const;

export const videoListSchema = {
  type: 'object',
  required: ['total', 'scannedAt', 'items'],
  properties: {
    total: { type: 'integer' },
    scannedAt: { type: ['string', 'null'], format: 'date-time' },
    items: { type: 'array', items: videoSchema },
  },
} as const;

const seriesSummaryProperties = {
  id: { type: 'string' },
  title: { type: 'string' },
  seasonCount: { type: 'integer' },
  episodeCount: { type: 'integer' },
  latestModifiedAt: { type: 'string', format: 'date-time' },
  artworkUrl: { type: ['string', 'null'] },
} as const;

const seriesSummaryRequired = ['id', 'title', 'seasonCount', 'episodeCount', 'latestModifiedAt', 'artworkUrl'];

export const seriesListSchema = {
  type: 'object',
  required: ['total', 'items'],
  properties: {
    total: { type: 'integer' },
    items: {
      type: 'array',
      items: { type: 'object', required: seriesSummaryRequired, properties: seriesSummaryProperties },
    },
  },
} as const;

export const seriesDetailSchema = {
  type: 'object',
  required: [...seriesSummaryRequired, 'seasons'],
  properties: {
    ...seriesSummaryProperties,
    seasons: {
      type: 'array',
      items: {
        type: 'object',
        required: ['number', 'episodes'],
        properties: { number: { type: 'integer' }, episodes: { type: 'array', items: videoSchema } },
      },
    },
  },
} as const;

export const scanResultSchema = {
  type: 'object',
  required: ['total', 'durationMs', 'scannedAt'],
  properties: {
    total: { type: 'integer' },
    durationMs: { type: 'integer' },
    scannedAt: { type: 'string', format: 'date-time' },
  },
} as const;
