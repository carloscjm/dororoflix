export interface Cue {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

export class SubtitleParseError extends Error {
  constructor(message = 'Arquivo de legenda inválido.') {
    super(message);
    this.name = 'SubtitleParseError';
  }
}

const TIMING = /^\s*((?:\d+:)?\d{1,2}:\d{1,2}[.,]\d{1,3})\s*-->\s*((?:\d+:)?\d{1,2}:\d{1,2}[.,]\d{1,3})/;

export function parseTimestamp(value: string): number {
  const [clock = '', fraction = '0'] = value.replace(',', '.').split('.');
  let seconds = 0;
  for (const part of clock.split(':')) seconds = seconds * 60 + Number(part);
  return seconds + Number(fraction.padEnd(3, '0').slice(0, 3)) / 1000;
}

/**
 * Lê WebVTT (o servidor sempre converte para VTT) e, por robustez, também SRT.
 * Blocos inválidos são ignorados; se nada for aproveitável, lança SubtitleParseError.
 */
export function parseVtt(text: string): Cue[] {
  const blocks = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split(/\n{2,}/);
  const cues: Cue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').filter((line, index) => index > 0 || line.trim() !== '');
    const timingIndex = lines.findIndex((line) => TIMING.test(line));
    if (timingIndex === -1 || timingIndex > 1) continue;
    const match = TIMING.exec(lines[timingIndex] ?? '');
    if (!match?.[1] || !match[2]) continue;
    const start = parseTimestamp(match[1]);
    const end = parseTimestamp(match[2]);
    const body = lines.slice(timingIndex + 1).join('\n').trim();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || body === '') continue;
    cues.push({ start, end, text: body });
  }
  if (cues.length === 0) throw new SubtitleParseError();
  return cues.sort((a, b) => a.start - b.start);
}

/**
 * Falas ativas no instante `time`. Busca binária pelo início + varredura curta
 * para trás (falas sobrepostas). O(log n) por chamada, adequado para a TV.
 */
export function activeCues(cues: readonly Cue[], time: number): Cue[] {
  let low = 0;
  let high = cues.length - 1;
  let last = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if ((cues[middle] as Cue).start <= time) {
      last = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  const result: Cue[] = [];
  // Falas muito longas são raras; olhar até 20 para trás cobre sobreposições reais.
  for (let index = last; index >= 0 && index > last - 20; index--) {
    const cue = cues[index] as Cue;
    if (cue.end > time) result.unshift(cue);
  }
  return result;
}
