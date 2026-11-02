import type { FastifyReply } from 'fastify';
import { subtitleInvalid } from '../errors/app-error.js';
import type { CatalogService } from '../library/catalog.service.js';
import { imageMimeTypeFor } from '../library/formats.js';
import { decodeSubtitle, parseSubtitleCues, toWebVtt } from '../library/subtitle-convert.js';
import type { Artwork, SubtitleTrack } from '../library/types.js';

/** Legendas são texto; nenhum arquivo legítimo chega perto disso. */
export const MAX_SUBTITLE_BYTES = 5 * 1024 * 1024;

/** Envia uma imagem de capa já existente na biblioteca (somente leitura, via MediaSource). */
export async function sendArtwork(
  reply: FastifyReply,
  catalog: CatalogService,
  sourceId: string,
  artwork: Artwork,
): Promise<FastifyReply> {
  const source = catalog.getSource(sourceId);
  const info = await source.stat(artwork.relativePath);
  const stream = await source.openStream(artwork.relativePath);
  return reply
    .type(imageMimeTypeFor(artwork.format))
    .header('Content-Length', String(info.sizeBytes))
    .header('Cache-Control', 'public, max-age=3600')
    .send(stream);
}

/** Lê a legenda, converte para WebVTT UTF-8 e envia. */
export async function sendSubtitle(
  reply: FastifyReply,
  catalog: CatalogService,
  sourceId: string,
  track: SubtitleTrack,
): Promise<FastifyReply> {
  const buffer = await catalog.getSource(sourceId).readFile(track.relativePath, MAX_SUBTITLE_BYTES);
  const cues = parseSubtitleCues(decodeSubtitle(buffer));
  if (cues.length === 0) throw subtitleInvalid();
  return reply
    .type('text/vtt; charset=utf-8')
    .header('Cache-Control', 'no-cache')
    .send(toWebVtt(cues));
}
