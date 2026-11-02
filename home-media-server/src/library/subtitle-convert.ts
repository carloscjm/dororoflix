/**
 * Conversão de legendas externas (SRT/VTT) para WebVTT normalizado em UTF-8.
 *
 * O app recebe sempre WebVTT, independentemente do arquivo original, e não
 * precisa lidar com codificações: muitas legendas em português são salvas em
 * Windows-1252 (ANSI), que aqui é detectado e convertido.
 */

export interface SubtitleCue {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

/** Decodifica o arquivo: BOM UTF-8/UTF-16, UTF-8 válido ou, como último recurso, Windows-1252. */
export function decodeSubtitle(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(buffer.subarray(3));
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buffer.subarray(2));
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(buffer.subarray(2));
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

const TIMING =
  /^\s*((?:\d+:)?\d{1,2}:\d{1,2}[.,]\d{1,3})\s*-->\s*((?:\d+:)?\d{1,2}:\d{1,2}[.,]\d{1,3})/;

/** "01:02:03,450" ou "02:03.450" → segundos. */
export function parseTimestamp(value: string): number {
  const [clock = '', fraction = '0'] = value.replace(',', '.').split('.');
  const parts = clock.split(':').map(Number);
  let seconds = 0;
  for (const part of parts) seconds = seconds * 60 + part;
  return seconds + Number(fraction.padEnd(3, '0').slice(0, 3)) / 1000;
}

/** Lê cues de SRT ou WebVTT. Blocos inválidos são ignorados em vez de derrubar a legenda inteira. */
export function parseSubtitleCues(text: string): SubtitleCue[] {
  const normalized = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const blocks = normalized.split(/\n{2,}/);
  const cues: SubtitleCue[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').filter((line, index) => index > 0 || line.trim() !== '');
    const timingIndex = lines.findIndex((line) => TIMING.test(line));
    if (timingIndex === -1 || timingIndex > 1) continue; // sem tempo, cabeçalho, NOTE, STYLE...

    const match = TIMING.exec(lines[timingIndex] ?? '');
    if (!match?.[1] || !match[2]) continue;
    const start = parseTimestamp(match[1]);
    const end = parseTimestamp(match[2]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;

    const body = lines
      .slice(timingIndex + 1)
      .map((line) => line.replace(/\{\\[^}]*\}/g, '').trimEnd()) // tags ASS como {\an8}
      .join('\n')
      .trim();
    if (body.length === 0) continue;

    cues.push({ start, end, text: body });
  }

  return cues.sort((a, b) => a.start - b.start);
}

function formatTimestamp(totalSeconds: number): string {
  const totalMs = Math.round(totalSeconds * 1000);
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const pad = (value: number, size = 2): string => String(value).padStart(size, '0');
  return `${pad(Math.floor(totalSec / 3600))}:${pad(Math.floor(totalSec / 60) % 60)}:${pad(totalSec % 60)}.${pad(ms, 3)}`;
}

export function toWebVtt(cues: readonly SubtitleCue[]): string {
  const body = cues
    .map((cue) => `${formatTimestamp(cue.start)} --> ${formatTimestamp(cue.end)}\n${cue.text.replace(/-->/g, '→')}`)
    .join('\n\n');
  return `WEBVTT\n\n${body}\n`;
}
