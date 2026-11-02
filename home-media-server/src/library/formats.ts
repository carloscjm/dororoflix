import path from 'node:path';

/**
 * Contêineres reconhecidos e seus MIME types.
 * O MIME type descreve o contêiner, não os codecs internos — veja a seção de
 * limitações no README.
 */
export const VIDEO_FORMATS = {
  mp4: 'video/mp4',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  mov: 'video/quicktime',
  webm: 'video/webm',
} as const satisfies Record<string, string>;

export type VideoFormat = keyof typeof VIDEO_FORMATS;

/** Legendas externas (texto). São sempre servidas convertidas para WebVTT. */
export const SUBTITLE_FORMATS = ['srt', 'vtt'] as const;
export type SubtitleFormat = (typeof SUBTITLE_FORMATS)[number];

/** Imagens que podem servir de capa (pôster) quando já existem na pasta. */
export const IMAGE_FORMATS = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
} as const satisfies Record<string, string>;

export type ImageFormat = keyof typeof IMAGE_FORMATS;

export function isVideoFormat(value: string): value is VideoFormat {
  return Object.hasOwn(VIDEO_FORMATS, value);
}

function extensionOf(fileName: string): string {
  return path.extname(fileName).slice(1).toLowerCase();
}

/** Detecta o formato pela extensão (sem diferenciar maiúsculas). Retorna null se não for vídeo. */
export function detectFormat(fileName: string): VideoFormat | null {
  const extension = extensionOf(fileName);
  return isVideoFormat(extension) ? extension : null;
}

export function detectSubtitleFormat(fileName: string): SubtitleFormat | null {
  const extension = extensionOf(fileName);
  return (SUBTITLE_FORMATS as readonly string[]).includes(extension) ? (extension as SubtitleFormat) : null;
}

export function detectImageFormat(fileName: string): ImageFormat | null {
  const extension = extensionOf(fileName);
  return Object.hasOwn(IMAGE_FORMATS, extension) ? (extension as ImageFormat) : null;
}

/** Arquivos que o scan precisa conhecer: vídeos, legendas e possíveis capas. */
export function isLibraryFile(fileName: string): boolean {
  return detectFormat(fileName) !== null || detectSubtitleFormat(fileName) !== null || detectImageFormat(fileName) !== null;
}

export function mimeTypeFor(format: VideoFormat): string {
  return VIDEO_FORMATS[format];
}

export function imageMimeTypeFor(format: ImageFormat): string {
  return IMAGE_FORMATS[format];
}
