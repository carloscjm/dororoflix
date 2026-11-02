import type { Readable } from 'node:stream';
import { fileMissing, isNodeError } from '../errors/app-error.js';
import type { CatalogService } from '../library/catalog.service.js';
import type { ByteRange, FileInfo, VideoItem } from '../library/types.js';
import { contentRange, ifRangeMatches, parseRangeHeader, unsatisfiedContentRange } from './range.js';

export interface StreamRequestHeaders {
  readonly range?: string | undefined;
  readonly ifRange?: string | undefined;
}

/** Decisão sobre como responder a uma requisição de stream, antes de abrir o arquivo. */
export type StreamPlan =
  | {
      readonly status: 200 | 206;
      readonly headers: Readonly<Record<string, string>>;
      readonly range: ByteRange | undefined;
    }
  | {
      readonly status: 416;
      readonly headers: Readonly<Record<string, string>>;
    };

export class StreamingService {
  constructor(private readonly catalog: CatalogService) {}

  /** Calcula status e cabeçalhos com base no estado atual do arquivo no disco. */
  async plan(video: VideoItem, request: StreamRequestHeaders): Promise<StreamPlan> {
    const info = await this.statOrMissing(video);
    const size = info.sizeBytes;
    const etag = buildEtag(info);

    const baseHeaders: Record<string, string> = {
      'Accept-Ranges': 'bytes',
      'Content-Type': video.mimeType,
      ETag: etag,
      'Last-Modified': info.modifiedAt.toUTCString(),
    };

    const resolution = ifRangeMatches(request.ifRange, etag, info.modifiedAt)
      ? parseRangeHeader(request.range, size)
      : ({ kind: 'none' } as const);

    switch (resolution.kind) {
      case 'unsatisfiable':
        return {
          status: 416,
          headers: { 'Accept-Ranges': 'bytes', 'Content-Range': unsatisfiedContentRange(size) },
        };

      case 'range': {
        const { range } = resolution;
        return {
          status: 206,
          range,
          headers: {
            ...baseHeaders,
            'Content-Range': contentRange(range, size),
            'Content-Length': String(range.end - range.start + 1),
          },
        };
      }

      case 'none':
        return { status: 200, range: undefined, headers: { ...baseHeaders, 'Content-Length': String(size) } };
    }
  }

  /** Abre o stream do arquivo (nunca carrega o vídeo inteiro na memória). */
  open(video: VideoItem, range: ByteRange | undefined): Promise<Readable> {
    return this.catalog.getSource(video.sourceId).openStream(video.relativePath, range);
  }

  private async statOrMissing(video: VideoItem): Promise<FileInfo> {
    try {
      return await this.catalog.getSource(video.sourceId).stat(video.relativePath);
    } catch (error) {
      if (isNodeError(error) && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
        throw fileMissing(error);
      }
      throw error;
    }
  }
}

function buildEtag(info: FileInfo): string {
  return `"${info.sizeBytes.toString(16)}-${Math.floor(info.modifiedAt.getTime()).toString(16)}"`;
}
