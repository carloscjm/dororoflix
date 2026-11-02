import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { SeriesDetailDto, SeriesListDto, VideoDto, VideoListDto } from '../src/routes/schemas.js';
import { testConfig } from './helpers.js';

let base: string;
let root: string;
let app: FastifyInstance;
let videos: VideoListDto;

const SRT_ANSI = Buffer.concat([
  Buffer.from('1\r\n00:00:01,000 --> 00:00:02,000\r\n', 'latin1'),
  Buffer.from([0x41, 0xe7, 0xe3, 0x6f]), // "Ação" em Windows-1252
  Buffer.from('\r\n', 'latin1'),
]);

async function write(relativePath: string, content: string | Buffer): Promise<void> {
  const absolute = path.join(root, ...relativePath.split('/'));
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, content);
}

function video(relativePath: string): VideoDto {
  const found = videos.items.find((item) => item.relativePath === relativePath);
  if (!found) throw new Error(`não encontrado: ${relativePath}`);
  return found;
}

beforeAll(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), 'media-series-test-'));
  root = path.join(base, 'Filmes');
  await write('Filme.mkv', Buffer.alloc(10));
  await write('Filme.pt-BR.srt', SRT_ANSI);
  await write('Filme.en.srt', 'isto não é uma legenda');
  await write('Filme.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  await write('Series/Minha Serie/poster.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  await write('Series/Minha Serie/Temporada 1/S01E02.mkv', Buffer.alloc(10));
  await write('Series/Minha Serie/Temporada 1/S01E01.mkv', Buffer.alloc(10));
  await write('Series/Minha Serie/Temporada 1/S01E01.en.vtt', 'WEBVTT\n\n00:01.000 --> 00:02.000\nHello\n');
  await write('Series/Minha Serie/Temporada 2/S02E01.mp4', Buffer.alloc(10));
  await fs.writeFile(path.join(base, 'segredo.srt'), '1\n00:00:01,000 --> 00:00:02,000\nsegredo\n');

  app = await buildApp(testConfig(root));
  videos = (await app.inject({ method: 'GET', url: '/api/videos' })).json<VideoListDto>();
});

afterAll(async () => {
  await app.close();
  await fs.rm(base, { recursive: true, force: true });
});

describe('GET /api/videos com séries e legendas', () => {
  it('continua listando apenas vídeos (legendas e imagens não viram itens)', () => {
    expect(videos.total).toBe(4);
  });

  it('expõe classificação, legendas e capa em campos adicionais', () => {
    expect(video('Filme.mkv')).toMatchObject({
      media: { kind: 'movie' },
      artworkUrl: `/api/videos/${video('Filme.mkv').id}/artwork`,
    });
    expect(video('Filme.mkv').subtitles.map((track) => track.language)).toEqual(['en', 'pt-BR']);
    expect(video('Series/Minha Serie/Temporada 1/S01E01.mkv').media).toMatchObject({
      kind: 'episode',
      seriesTitle: 'Minha Serie',
      season: 1,
      episode: 1,
    });
  });
});

describe('/api/series', () => {
  it('lista séries com contagens', async () => {
    const list = (await app.inject({ method: 'GET', url: '/api/series' })).json<SeriesListDto>();
    expect(list.items).toMatchObject([{ title: 'Minha Serie', seasonCount: 2, episodeCount: 3 }]);
  });

  it('detalha temporadas e episódios ordenados', async () => {
    const id = (await app.inject({ method: 'GET', url: '/api/series' })).json<SeriesListDto>().items[0]?.id;
    const response = await app.inject({ method: 'GET', url: `/api/series/${id}` });
    expect(response.statusCode).toBe(200);
    const detail = response.json<SeriesDetailDto>();
    expect(detail.seasons.map((season) => [season.number, season.episodes.map((episode) => episode.relativePath)])).toEqual([
      [1, ['Series/Minha Serie/Temporada 1/S01E01.mkv', 'Series/Minha Serie/Temporada 1/S01E02.mkv']],
      [2, ['Series/Minha Serie/Temporada 2/S02E01.mp4']],
    ]);

    const artwork = await app.inject({ method: 'GET', url: `/api/series/${id}/artwork` });
    expect(artwork.statusCode).toBe(200);
    expect(artwork.headers['content-type']).toBe('image/png');
  });

  it('404 para série inexistente e 400 para ID inválido', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/series/0000000000000000' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/series/..%2F..' })).statusCode).toBe(400);
  });
});

describe('legendas', () => {
  it('converte SRT Windows-1252 para WebVTT UTF-8', async () => {
    const track = video('Filme.mkv').subtitles.find((item) => item.language === 'pt-BR');
    const response = await app.inject({ method: 'GET', url: track?.url ?? '' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/vtt; charset=utf-8');
    expect(response.body).toBe('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nAção\n');
  });

  it('serve VTT de episódio e lista legendas por vídeo', async () => {
    const episode = video('Series/Minha Serie/Temporada 1/S01E01.mkv');
    const list = await app.inject({ method: 'GET', url: `/api/videos/${episode.id}/subtitles` });
    expect(list.json<{ items: unknown[] }>().items).toHaveLength(1);
    const response = await app.inject({ method: 'GET', url: episode.subtitles[0]?.url ?? '' });
    expect(response.body).toContain('Hello');
  });

  it('retorna 422 para legenda sem falas válidas', async () => {
    const track = video('Filme.mkv').subtitles.find((item) => item.language === 'en');
    const response = await app.inject({ method: 'GET', url: track?.url ?? '' });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ error: { code: 'SUBTITLE_INVALID' } });
  });

  it('não serve legenda de outro vídeo nem aceita caminhos como ID', async () => {
    const filme = video('Filme.mkv');
    const episodeTrack = video('Series/Minha Serie/Temporada 1/S01E01.mkv').subtitles[0];
    const crossed = await app.inject({ method: 'GET', url: `/api/videos/${filme.id}/subtitles/${episodeTrack?.id}` });
    expect(crossed.statusCode).toBe(404);
    for (const attempt of ['..%2F..%2Fsegredo.srt', '..%5Csegredo.srt', 'segredo.srt']) {
      const response = await app.inject({ method: 'GET', url: `/api/videos/${filme.id}/subtitles/${attempt}` });
      expect([400, 404]).toContain(response.statusCode);
      expect(response.body).not.toContain('segredo');
    }
  });

  it('capa do vídeo: 200 com tipo correto; 404 quando não existe', async () => {
    const ok = await app.inject({ method: 'GET', url: `/api/videos/${video('Filme.mkv').id}/artwork` });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['content-type']).toBe('image/jpeg');
    const none = await app.inject({ method: 'GET', url: `/api/videos/${video('Series/Minha Serie/Temporada 2/S02E01.mp4').id}/artwork` });
    expect(none.statusCode).toBe(404);
  });
});

describe('CORS para o app Tizen empacotado', () => {
  it('libera a origem "null" quando configurada e responde ao preflight', async () => {
    const tizenApp = await buildApp(testConfig(root, { corsOrigins: ['null', 'file://'] }));
    try {
      const response = await tizenApp.inject({ method: 'GET', url: '/api/series', headers: { origin: 'null' } });
      expect(response.headers['access-control-allow-origin']).toBe('null');
      const preflight = await tizenApp.inject({
        method: 'OPTIONS',
        url: '/api/library/scan',
        headers: { origin: 'file://', 'access-control-request-method': 'POST' },
      });
      expect(preflight.statusCode).toBe(204);
      const other = await tizenApp.inject({ method: 'GET', url: '/api/series', headers: { origin: 'http://evil.example' } });
      expect(other.headers['access-control-allow-origin']).toBeUndefined();
    } finally {
      await tizenApp.close();
    }
  });
});
