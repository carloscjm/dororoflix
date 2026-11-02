import { describe, expect, it } from 'vitest';
import { decodeSubtitle, parseSubtitleCues, parseTimestamp, toWebVtt } from '../src/library/subtitle-convert.js';

const SRT = `1
00:00:01,000 --> 00:00:04,500
Olá, <i>mundo</i>!

2
00:00:05,250 --> 00:00:07,000
{\\an8}Segunda linha
continua aqui

3
sem tempo válido

4
00:00:09,000 --> 00:00:08,000
fim antes do início
`;

describe('parseSubtitleCues', () => {
  it('lê SRT, remove tags ASS e ignora blocos inválidos', () => {
    expect(parseSubtitleCues(SRT)).toEqual([
      { start: 1, end: 4.5, text: 'Olá, <i>mundo</i>!' },
      { start: 5.25, end: 7, text: 'Segunda linha\ncontinua aqui' },
    ]);
  });

  it('lê WebVTT com cabeçalho, identificadores e horas omitidas', () => {
    const vtt = 'WEBVTT\n\nNOTE comentário\n\nintro\n00:01.000 --> 00:02.500 line:90%\nTexto\n';
    expect(parseSubtitleCues(vtt)).toEqual([{ start: 1, end: 2.5, text: 'Texto' }]);
  });

  it('aceita CRLF e BOM', () => {
    expect(parseSubtitleCues('﻿1\r\n00:00:01,000 --> 00:00:02,000\r\nOi\r\n')).toHaveLength(1);
  });

  it('converte timestamps', () => {
    expect(parseTimestamp('01:02:03,450')).toBeCloseTo(3723.45);
    expect(parseTimestamp('02:03.5')).toBeCloseTo(123.5);
  });
});

describe('decodeSubtitle', () => {
  it('lê UTF-8 com e sem BOM', () => {
    expect(decodeSubtitle(Buffer.from('ação', 'utf8'))).toBe('ação');
    expect(decodeSubtitle(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('é', 'utf8')]))).toBe('é');
  });

  it('cai para Windows-1252 quando o arquivo não é UTF-8 (legendas ANSI)', () => {
    expect(decodeSubtitle(Buffer.from([0x61, 0xe7, 0xe3, 0x6f]))).toBe('ação');
  });

  it('lê UTF-16 LE com BOM', () => {
    expect(decodeSubtitle(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('olá', 'utf16le')]))).toBe('olá');
  });
});

describe('toWebVtt', () => {
  it('gera WebVTT válido que pode ser lido de volta', () => {
    const cues = parseSubtitleCues(SRT);
    const vtt = toWebVtt(cues);
    expect(vtt.startsWith('WEBVTT\n\n00:00:01.000 --> 00:00:04.500\n')).toBe(true);
    expect(parseSubtitleCues(vtt)).toEqual(cues);
  });
});
