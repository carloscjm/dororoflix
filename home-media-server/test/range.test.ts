import { describe, expect, it } from 'vitest';
import { contentRange, ifRangeMatches, parseRangeHeader, unsatisfiedContentRange } from '../src/streaming/range.js';

const SIZE = 1000;

describe('parseRangeHeader', () => {
  it.each([
    ['bytes=0-99', 0, 99],
    ['bytes=500-', 500, 999],
    ['bytes=-100', 900, 999],
    ['bytes=0-0', 0, 0],
    ['bytes=999-999', 999, 999],
    ['bytes=0-5000', 0, 999], // fim além do arquivo é limitado ao último byte
    ['bytes=-5000', 0, 999], // sufixo maior que o arquivo = arquivo inteiro
    ['BYTES=10-20', 10, 20], // unidade sem distinção de caixa
    ['  bytes= 10 - 20 ', 10, 20],
  ])('%s → %i-%i', (header, start, end) => {
    expect(parseRangeHeader(header, SIZE)).toEqual({ kind: 'range', range: { start, end } });
  });

  it.each([
    [undefined],
    ['bytes=abc'],
    ['bytes=-'],
    ['items=0-10'],
    ['bytes=50-10'], // fim antes do início: inválido → ignorado
    ['bytes=0-10,20-30'], // múltiplos intervalos → ignorados
    ['bytes=1.5-2'],
  ])('ignora %s (resposta 200)', (header) => {
    expect(parseRangeHeader(header, SIZE)).toEqual({ kind: 'none' });
  });

  it.each([['bytes=1000-'], ['bytes=1000-2000'], ['bytes=-0']])('%s é não satisfazível (416)', (header) => {
    expect(parseRangeHeader(header, SIZE)).toEqual({ kind: 'unsatisfiable' });
  });

  it('qualquer Range em arquivo vazio é não satisfazível', () => {
    expect(parseRangeHeader('bytes=0-', 0)).toEqual({ kind: 'unsatisfiable' });
    expect(parseRangeHeader('bytes=-10', 0)).toEqual({ kind: 'unsatisfiable' });
  });
});

describe('ifRangeMatches', () => {
  const etag = '"3e8-abc"';
  const modified = new Date('2024-05-01T12:00:00Z');

  it('sem If-Range sempre permite o Range', () => {
    expect(ifRangeMatches(undefined, etag, modified)).toBe(true);
  });

  it('compara ETag de forma forte', () => {
    expect(ifRangeMatches(etag, etag, modified)).toBe(true);
    expect(ifRangeMatches('"outro"', etag, modified)).toBe(false);
    expect(ifRangeMatches(`W/${etag}`, etag, modified)).toBe(false);
  });

  it('compara data com precisão de segundos', () => {
    expect(ifRangeMatches(modified.toUTCString(), etag, modified)).toBe(true);
    expect(ifRangeMatches(new Date('2020-01-01').toUTCString(), etag, modified)).toBe(false);
    expect(ifRangeMatches('data inválida', etag, modified)).toBe(false);
  });
});

describe('Content-Range', () => {
  it('formata respostas 206 e 416', () => {
    expect(contentRange({ start: 0, end: 99 }, SIZE)).toBe('bytes 0-99/1000');
    expect(unsatisfiedContentRange(SIZE)).toBe('bytes */1000');
  });
});
