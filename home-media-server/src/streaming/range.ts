import type { ByteRange } from '../library/types.js';

/**
 * Resultado da interpretação do cabeçalho Range (RFC 9110 §14).
 *
 * - `none`: sem Range, ou Range que o servidor decide ignorar (sintaxe inválida
 *   ou múltiplos intervalos). Resposta: 200 com o arquivo inteiro.
 * - `range`: intervalo único satisfazível. Resposta: 206.
 * - `unsatisfiable`: intervalo válido mas fora do arquivo. Resposta: 416.
 */
export type RangeResolution =
  | { readonly kind: 'none' }
  | { readonly kind: 'range'; readonly range: ByteRange }
  | { readonly kind: 'unsatisfiable' };

const NONE: RangeResolution = { kind: 'none' };
const UNSATISFIABLE: RangeResolution = { kind: 'unsatisfiable' };
const SINGLE_BYTE_RANGE = /^bytes=\s*(\d*)\s*-\s*(\d*)$/i;

export function parseRangeHeader(header: string | undefined, size: number): RangeResolution {
  if (header === undefined) return NONE;

  const value = header.trim();
  // Múltiplos intervalos exigiriam multipart/byteranges; a RFC permite ignorá-los.
  // Players de vídeo (navegadores, Tizen) usam sempre intervalo único.
  if (value.includes(',')) return NONE;

  const match = SINGLE_BYTE_RANGE.exec(value);
  if (!match) return NONE;

  const startText = match[1] ?? '';
  const endText = match[2] ?? '';
  if (startText === '' && endText === '') return NONE;

  // Sufixo: "bytes=-500" = últimos 500 bytes.
  if (startText === '') {
    const suffixLength = Number(endText);
    if (!Number.isSafeInteger(suffixLength)) return NONE;
    if (suffixLength === 0 || size === 0) return UNSATISFIABLE;
    return { kind: 'range', range: { start: Math.max(0, size - suffixLength), end: size - 1 } };
  }

  const start = Number(startText);
  const end = endText === '' ? size - 1 : Number(endText);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return NONE;
  if (endText !== '' && end < start) return NONE; // sintaticamente inválido → ignorar

  if (start >= size) return UNSATISFIABLE;
  return { kind: 'range', range: { start, end: Math.min(end, size - 1) } };
}

/**
 * Avalia o cabeçalho If-Range: o Range só é aplicado se o validador
 * corresponder à versão atual do arquivo; caso contrário envia-se tudo (200).
 */
export function ifRangeMatches(ifRange: string | undefined, etag: string, lastModified: Date): boolean {
  if (ifRange === undefined) return true;

  const value = ifRange.trim();
  if (value.startsWith('"') || value.startsWith('W/')) {
    return value === etag; // comparação forte: ETag fraco nunca corresponde
  }

  const date = Date.parse(value);
  if (Number.isNaN(date)) return false;
  return Math.floor(lastModified.getTime() / 1000) === Math.floor(date / 1000);
}

export function contentRange(range: ByteRange, size: number): string {
  return `bytes ${range.start}-${range.end}/${size}`;
}

export function unsatisfiedContentRange(size: number): string {
  return `bytes */${size}`;
}
