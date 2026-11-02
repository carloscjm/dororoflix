import type { Readable } from 'node:stream';
import type { ImageFormat, SubtitleFormat, VideoFormat } from './formats.js';

/** Classificação do vídeo: filme avulso ou episódio de série. */
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

/** Legenda externa encontrada junto ao vídeo. */
export interface SubtitleTrack {
  readonly id: string;
  /** Código BCP 47 (ex.: "pt-BR", "en") ou null quando não identificado. */
  readonly language: string | null;
  readonly label: string;
  readonly format: SubtitleFormat;
  readonly forced: boolean;
  readonly relativePath: string;
}

/** Imagem já existente na biblioteca usada como capa. */
export interface Artwork {
  readonly relativePath: string;
  readonly format: ImageFormat;
}

/** Item do catálogo. Nunca expõe caminhos absolutos. */
export interface VideoItem {
  readonly id: string;
  /** Origem do arquivo ("local" hoje; ex.: "gdrive" no futuro). */
  readonly sourceId: string;
  readonly title: string;
  readonly format: VideoFormat;
  readonly mimeType: string;
  readonly sizeBytes: number;
  /** Caminho relativo à raiz da origem, sempre com "/". */
  readonly relativePath: string;
  readonly modifiedAt: Date;
  readonly media: MediaInfo;
  readonly subtitles: readonly SubtitleTrack[];
  readonly artwork: Artwork | null;
}

/** Série montada a partir dos episódios identificados no scan. */
export interface SeriesItem {
  readonly id: string;
  readonly sourceId: string;
  readonly title: string;
  readonly artwork: Artwork | null;
  /** Temporadas em ordem crescente; episódios ordenados por número. */
  readonly seasons: readonly SeasonGroup[];
}

export interface SeasonGroup {
  readonly number: number;
  readonly episodes: readonly VideoItem[];
}

/** Arquivo encontrado por uma origem durante o scan (vídeo, legenda ou imagem). */
export interface DiscoveredFile {
  readonly relativePath: string;
  readonly sizeBytes: number;
  readonly modifiedAt: Date;
}

export interface FileInfo {
  readonly sizeBytes: number;
  readonly modifiedAt: Date;
}

/** Intervalo de bytes inclusivo, como no HTTP Range. */
export interface ByteRange {
  readonly start: number;
  readonly end: number;
}

/**
 * Abstração de uma origem de mídia. Hoje existe só a pasta local; uma
 * integração com Google Drive implementaria esta mesma interface.
 */
export interface MediaSource {
  readonly id: string;
  /** Lista os arquivos relevantes da origem: vídeos, legendas e imagens. */
  scan(): Promise<DiscoveredFile[]>;
  /** Metadados atuais do arquivo (tamanho pode ter mudado desde o scan). */
  stat(relativePath: string): Promise<FileInfo>;
  /** Abre um stream somente leitura do arquivo, opcionalmente limitado a um intervalo. */
  openStream(relativePath: string, range?: ByteRange): Promise<Readable>;
  /** Lê um arquivo pequeno inteiro (ex.: legenda), recusando arquivos maiores que `maxBytes`. */
  readFile(relativePath: string, maxBytes: number): Promise<Buffer>;
}

export interface ScanResult {
  readonly total: number;
  readonly durationMs: number;
  readonly scannedAt: Date;
}
