import type { FastifyPluginAsync } from 'fastify';
import { artworkNotFound, errorBody, subtitleNotFound, videoNotFound } from '../errors/app-error.js';
import type { CatalogService } from '../library/catalog.service.js';
import { audioCodecLabel, PROBE_BYTES, probeAudioCodecs, type AudioProbe } from '../library/media-probe.js';
import type { VideoItem } from '../library/types.js';
import type { StreamingService } from '../streaming/streaming.service.js';
import { sendArtwork, sendSubtitle } from './media-files.js';
import {
  errorSchema,
  subtitleParamsSchema,
  subtitleSchema,
  toSubtitleDto,
  toVideoDto,
  videoIdParamsSchema,
  videoListSchema,
  videoSchema,
  type SubtitleDto,
  type VideoDto,
  type VideoListDto,
} from './schemas.js';

export interface VideosRoutesOptions {
  readonly catalog: CatalogService;
  readonly streaming: StreamingService;
}

interface VideoIdParams {
  readonly id: string;
}

export const videosRoutes: FastifyPluginAsync<VideosRoutesOptions> = async (app, { catalog, streaming }) => {
  const findOrThrow = (id: string): VideoItem => {
    const video = catalog.get(id);
    if (!video) throw videoNotFound(id);
    return video;
  };

  app.get<{ Reply: VideoListDto }>(
    '/api/videos',
    { schema: { response: { 200: videoListSchema } } },
    async () => {
      const lastScan = catalog.getLastScan();
      const items = catalog.list().map(toVideoDto);
      return { total: items.length, scannedAt: lastScan ? lastScan.scannedAt.toISOString() : null, items };
    },
  );

  app.get<{ Params: VideoIdParams; Reply: VideoDto }>(
    '/api/videos/:id',
    { schema: { params: videoIdParamsSchema, response: { 200: videoSchema, '4xx': errorSchema } } },
    async (request) => toVideoDto(findOrThrow(request.params.id)),
  );

  app.route<{ Params: VideoIdParams }>({
    method: ['GET', 'HEAD'],
    url: '/api/videos/:id/stream',
    exposeHeadRoute: false,
    schema: { params: videoIdParamsSchema },
    handler: async (request, reply) => {
      const video = findOrThrow(request.params.id);
      const plan = await streaming.plan(video, {
        range: request.headers.range,
        ifRange: headerValue(request.headers['if-range']),
      });

      reply.code(plan.status).headers(plan.headers);

      if (plan.status === 416) {
        request.log.debug({ id: video.id, range: request.headers.range }, 'Range não satisfazível');
        return reply.send(errorBody('RANGE_NOT_SATISFIABLE', 'O intervalo solicitado está fora do arquivo.'));
      }

      if (request.method === 'HEAD') return reply.send();

      const stream = await streaming.open(video, plan.range);
      return reply.send(stream);
    },
  });

  app.get<{ Params: VideoIdParams; Reply: { items: readonly SubtitleDto[] } }>(
    '/api/videos/:id/subtitles',
    {
      schema: {
        params: videoIdParamsSchema,
        response: {
          200: { type: 'object', required: ['items'], properties: { items: { type: 'array', items: subtitleSchema } } },
          '4xx': errorSchema,
        },
      },
    },
    async (request) => {
      const video = findOrThrow(request.params.id);
      return { items: video.subtitles.map((track) => toSubtitleDto(video.id, track)) };
    },
  );

  // Só serve legendas que o scan associou ao vídeo: o ID nunca vira caminho de arquivo.
  app.get<{ Params: SubtitleParams }>(
    '/api/videos/:id/subtitles/:subtitleId',
    { schema: { params: subtitleParamsSchema } },
    async (request, reply) => {
      const video = findOrThrow(request.params.id);
      const track = video.subtitles.find((item) => item.id === request.params.subtitleId);
      if (!track) throw subtitleNotFound(request.params.subtitleId);
      return sendSubtitle(reply, catalog, video.sourceId, track);
    },
  );

  // Codecs de áudio (lidos do início do arquivo, em cache por vídeo/data de modificação).
  const probeCache = new Map<string, AudioProbe>();
  app.get<{ Params: VideoIdParams }>(
    '/api/videos/:id/probe',
    {
      schema: {
        params: videoIdParamsSchema,
        response: {
          200: {
            type: 'object',
            required: ['audioCodecs', 'audioLabels', 'unsupported'],
            properties: {
              audioCodecs: { type: 'array', items: { type: 'string' } },
              audioLabels: { type: 'array', items: { type: 'string' } },
              unsupported: { type: 'boolean' },
            },
          },
          '4xx': errorSchema,
        },
      },
    },
    async (request) => {
      const video = findOrThrow(request.params.id);
      const key = `${video.id}:${video.modifiedAt.getTime()}`;
      let probe = probeCache.get(key);
      if (!probe) {
        const stream = await streaming.open(video, { start: 0, end: Math.max(0, Math.min(video.sizeBytes, PROBE_BYTES) - 1) });
        const chunks: Buffer[] = [];
        for await (const chunk of stream) chunks.push(chunk as Buffer);
        probe = probeAudioCodecs(Buffer.concat(chunks));
        probeCache.set(key, probe);
      }
      return { ...probe, audioLabels: probe.audioCodecs.map(audioCodecLabel) };
    },
  );

  app.get<{ Params: VideoIdParams }>(
    '/api/videos/:id/artwork',
    { schema: { params: videoIdParamsSchema } },
    async (request, reply) => {
      const video = findOrThrow(request.params.id);
      if (!video.artwork) throw artworkNotFound();
      return sendArtwork(reply, catalog, video.sourceId, video.artwork);
    },
  );
};

interface SubtitleParams {
  readonly id: string;
  readonly subtitleId: string;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
