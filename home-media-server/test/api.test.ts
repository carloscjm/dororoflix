import fs from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { VideoDto, VideoListDto } from '../src/routes/schemas.js';
import { createFixtureLibrary, MOVIE_SIZE, testConfig, type FixtureLibrary } from './helpers.js';

let library: FixtureLibrary;
let app: FastifyInstance;
let movie: VideoDto;

async function listVideos(target: FastifyInstance = app): Promise<VideoListDto> {
  const response = await target.inject({ method: 'GET', url: '/api/videos' });
  return response.json<VideoListDto>();
}

function findByPath(list: VideoListDto, relativePath: string): VideoDto {
  const video = list.items.find((item) => item.relativePath === relativePath);
  if (!video) throw new Error(`Vídeo de teste não encontrado: ${relativePath}`);
  return video;
}

beforeAll(async () => {
  library = await createFixtureLibrary();
  app = await buildApp(testConfig(library.root));
  movie = findByPath(await listVideos(), 'Filme.Exemplo_2020.mp4');
});

afterAll(async () => {
  await app.close();
  await library.cleanup();
});

describe('GET /health', () => {
  it('responde ok com o resumo do catálogo', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ status: string; catalog: { total: number; scannedAt: string } }>();
    expect(body.status).toBe('ok');
    expect(body.catalog.total).toBe(5);
    expect(Date.parse(body.catalog.scannedAt)).not.toBeNaN();
  });
});

describe('GET /api/videos', () => {
  it('lista recursivamente apenas vídeos suportados', async () => {
    const list = await listVideos();
    expect(list.total).toBe(5);
    expect(list.items.map((item) => item.relativePath).sort()).toEqual([
      'Filme.Exemplo_2020.mp4',
      'Séries/Temporada 1/Episodio_01.mkv',
      'Séries/Temporada 1/antigo.avi',
      'Séries/clipe.WEBM',
      'vazio.mov',
    ]);
  });

  it('expõe metadados corretos e nenhum caminho absoluto', async () => {
    expect(movie).toMatchObject({
      title: 'Filme Exemplo 2020',
      format: 'mp4',
      mimeType: 'video/mp4',
      sizeBytes: MOVIE_SIZE,
      sourceId: 'local',
      streamUrl: `/api/videos/${movie.id}/stream`,
    });
    const raw = (await app.inject({ method: 'GET', url: '/api/videos' })).body;
    expect(raw).not.toContain(library.root.replaceAll('\\', '\\\\'));
  });

  it('mantém IDs estáveis entre instâncias do servidor', async () => {
    const other = await buildApp(testConfig(library.root));
    try {
      const ids = (await listVideos(other)).items.map((item) => item.id).sort();
      expect(ids).toEqual((await listVideos()).items.map((item) => item.id).sort());
    } finally {
      await other.close();
    }
  });
});

describe('GET /api/videos/:id', () => {
  it('retorna os metadados do vídeo', async () => {
    const response = await app.inject({ method: 'GET', url: `/api/videos/${movie.id}` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(movie);
  });

  it('retorna 404 para ID inexistente', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/videos/0000000000000000' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: 'VIDEO_NOT_FOUND' } });
  });

  it('retorna 400 para ID em formato inválido', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/videos/nao-e-um-id' });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toHaveProperty('error.code');
  });
});

describe('GET /api/videos/:id/stream', () => {
  const streamUrl = (): string => `/api/videos/${movie.id}/stream`;

  it('sem Range: 200 com o arquivo inteiro', async () => {
    const response = await app.inject({ method: 'GET', url: streamUrl() });
    expect(response.statusCode).toBe(200);
    expect(response.headers['accept-ranges']).toBe('bytes');
    expect(response.headers['content-length']).toBe(String(MOVIE_SIZE));
    expect(response.headers['content-type']).toBe('video/mp4');
    expect(response.headers['etag']).toBeTruthy();
    expect(response.headers['last-modified']).toBeTruthy();
    expect(response.rawPayload.equals(library.movieBytes)).toBe(true);
  });

  it.each([
    ['bytes=0-99', 0, 99],
    ['bytes=900-', 900, 999],
    ['bytes=-100', 900, 999],
    ['bytes=500-500', 500, 500],
    ['bytes=990-5000', 990, 999],
  ])('Range %s: 206 com bytes %i-%i', async (range, start, end) => {
    const response = await app.inject({ method: 'GET', url: streamUrl(), headers: { range } });
    expect(response.statusCode).toBe(206);
    expect(response.headers['content-range']).toBe(`bytes ${start}-${end}/${MOVIE_SIZE}`);
    expect(response.headers['content-length']).toBe(String(end - start + 1));
    expect(response.headers['accept-ranges']).toBe('bytes');
    expect(response.rawPayload.equals(library.movieBytes.subarray(start, end + 1))).toBe(true);
  });

  it('Range fora do arquivo: 416 com Content-Range bytes */tamanho', async () => {
    const response = await app.inject({ method: 'GET', url: streamUrl(), headers: { range: 'bytes=1000-' } });
    expect(response.statusCode).toBe(416);
    expect(response.headers['content-range']).toBe(`bytes */${MOVIE_SIZE}`);
    expect(response.json()).toMatchObject({ error: { code: 'RANGE_NOT_SATISFIABLE' } });
  });

  it.each([['bytes=abc'], ['bytes=0-10,20-30'], ['bytes=50-10']])(
    'Range inválido ou múltiplo (%s) é ignorado: 200',
    async (range) => {
      const response = await app.inject({ method: 'GET', url: streamUrl(), headers: { range } });
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-length']).toBe(String(MOVIE_SIZE));
    },
  );

  it('If-Range com ETag atual aplica o Range; com ETag antigo envia tudo', async () => {
    const full = await app.inject({ method: 'GET', url: streamUrl() });
    const etag = String(full.headers['etag']);

    const matching = await app.inject({
      method: 'GET',
      url: streamUrl(),
      headers: { range: 'bytes=0-9', 'if-range': etag },
    });
    expect(matching.statusCode).toBe(206);

    const stale = await app.inject({
      method: 'GET',
      url: streamUrl(),
      headers: { range: 'bytes=0-9', 'if-range': '"versao-antiga"' },
    });
    expect(stale.statusCode).toBe(200);
    expect(stale.rawPayload.length).toBe(MOVIE_SIZE);
  });

  it('HEAD retorna os cabeçalhos sem corpo', async () => {
    const full = await app.inject({ method: 'HEAD', url: streamUrl() });
    expect(full.statusCode).toBe(200);
    expect(full.headers['content-length']).toBe(String(MOVIE_SIZE));
    expect(full.rawPayload.length).toBe(0);

    const partial = await app.inject({ method: 'HEAD', url: streamUrl(), headers: { range: 'bytes=0-9' } });
    expect(partial.statusCode).toBe(206);
    expect(partial.headers['content-range']).toBe(`bytes 0-9/${MOVIE_SIZE}`);
  });

  it('arquivo vazio: 200 sem corpo e 416 para qualquer Range', async () => {
    const empty = findByPath(await listVideos(), 'vazio.mov');
    const full = await app.inject({ method: 'GET', url: empty.streamUrl });
    expect(full.statusCode).toBe(200);
    expect(full.headers['content-length']).toBe('0');
    expect(full.headers['content-type']).toBe('video/quicktime');

    const ranged = await app.inject({ method: 'GET', url: empty.streamUrl, headers: { range: 'bytes=0-' } });
    expect(ranged.statusCode).toBe(416);
    expect(ranged.headers['content-range']).toBe('bytes */0');
  });

  it('usa o tipo MIME de cada contêiner', async () => {
    const list = await listVideos();
    expect(findByPath(list, 'Séries/Temporada 1/Episodio_01.mkv').mimeType).toBe('video/x-matroska');
    expect(findByPath(list, 'Séries/Temporada 1/antigo.avi').mimeType).toBe('video/x-msvideo');
    expect(findByPath(list, 'Séries/clipe.WEBM').mimeType).toBe('video/webm');
  });

  it('retorna 404 para vídeo inexistente', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/videos/0000000000000000/stream' });
    expect(response.statusCode).toBe(404);
  });

  it('não altera os arquivos originais', async () => {
    await app.inject({ method: 'GET', url: streamUrl(), headers: { range: 'bytes=0-499' } });
    const onDisk = await fs.readFile(path.join(library.root, 'Filme.Exemplo_2020.mp4'));
    expect(onDisk.equals(library.movieBytes)).toBe(true);
  });
});

describe('segurança', () => {
  it.each([
    ['/api/videos/..%2F..%2Ffora%2Fsegredo.mp4/stream'],
    ['/api/videos/../../fora/segredo.mp4'],
    ['/api/videos/%2e%2e%2f%2e%2e%2fsegredo/stream'],
  ])('não permite path traversal por %s', async (url) => {
    const response = await app.inject({ method: 'GET', url });
    expect([400, 404]).toContain(response.statusCode);
    expect(response.body).not.toContain('conteúdo fora da biblioteca');
  });

  it('ignora links simbólicos que apontam para fora da biblioteca', async (context) => {
    const isolated = await createFixtureLibrary();
    try {
      try {
        await fs.symlink(path.join(isolated.outside, 'segredo.mp4'), path.join(isolated.root, 'atalho.mp4'));
        await fs.symlink(isolated.outside, path.join(isolated.root, 'pasta-atalho'), 'dir');
      } catch {
        context.skip(); // no Windows, criar symlinks pode exigir privilégios de administrador
      }
      const instance = await buildApp(testConfig(isolated.root));
      try {
        const paths = (await listVideos(instance)).items.map((item) => item.relativePath);
        expect(paths).not.toContain('atalho.mp4');
        expect(paths.some((p) => p.startsWith('pasta-atalho/'))).toBe(false);
      } finally {
        await instance.close();
      }
    } finally {
      await isolated.cleanup();
    }
  });

  it('recusa clientes fora da rede local quando LAN_ONLY=true', async () => {
    const response = await app.inject({ method: 'GET', url: '/health', remoteAddress: '8.8.8.8' });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: 'FORBIDDEN_NETWORK' } });

    const lan = await app.inject({ method: 'GET', url: '/health', remoteAddress: '192.168.0.42' });
    expect(lan.statusCode).toBe(200);
  });

  it('permite qualquer origem de rede quando LAN_ONLY=false', async () => {
    const open = await buildApp(testConfig(library.root, { lanOnly: false }));
    try {
      const response = await open.inject({ method: 'GET', url: '/health', remoteAddress: '8.8.8.8' });
      expect(response.statusCode).toBe(200);
    } finally {
      await open.close();
    }
  });
});

describe('CORS', () => {
  it('fica desativado por padrão', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/videos', headers: { origin: 'http://tv.local' } });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('libera as origens configuradas e expõe os cabeçalhos de Range', async () => {
    const withCors = await buildApp(testConfig(library.root, { corsOrigins: ['http://tv.local'] }));
    try {
      const preflight = await withCors.inject({
        method: 'OPTIONS',
        url: streamUrlFor(movie),
        headers: {
          origin: 'http://tv.local',
          'access-control-request-method': 'GET',
          'access-control-request-headers': 'range',
        },
      });
      expect(preflight.statusCode).toBe(204);
      expect(preflight.headers['access-control-allow-origin']).toBe('http://tv.local');
      expect(String(preflight.headers['access-control-allow-headers'])).toMatch(/range/i);

      const ranged = await withCors.inject({
        method: 'GET',
        url: streamUrlFor(movie),
        headers: { origin: 'http://tv.local', range: 'bytes=0-9' },
      });
      expect(ranged.statusCode).toBe(206);
      expect(ranged.headers['access-control-allow-origin']).toBe('http://tv.local');
      expect(String(ranged.headers['access-control-expose-headers'])).toContain('Content-Range');

      const denied = await withCors.inject({ method: 'GET', url: '/health', headers: { origin: 'http://outro.site' } });
      expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    } finally {
      await withCors.close();
    }
  });
});

describe('POST /api/library/scan e mudanças no disco', () => {
  it('detecta arquivos novos, removidos e alterados', async () => {
    const isolated = await createFixtureLibrary();
    const instance = await buildApp(testConfig(isolated.root));
    try {
      const target = findByPath(await listVideos(instance), 'Filme.Exemplo_2020.mp4');

      // Arquivo alterado após o scan: Content-Length reflete o tamanho atual.
      await fs.writeFile(path.join(isolated.root, 'Filme.Exemplo_2020.mp4'), Buffer.alloc(10));
      const changed = await instance.inject({ method: 'GET', url: target.streamUrl });
      expect(changed.headers['content-length']).toBe('10');

      // Arquivo removido após o scan: 404 com código específico.
      await fs.rm(path.join(isolated.root, 'Filme.Exemplo_2020.mp4'));
      const missing = await instance.inject({ method: 'GET', url: target.streamUrl });
      expect(missing.statusCode).toBe(404);
      expect(missing.json()).toMatchObject({ error: { code: 'FILE_MISSING' } });

      // Novo arquivo aparece após reescanear.
      await fs.writeFile(path.join(isolated.root, 'Novo Filme.webm'), Buffer.alloc(5));
      const scan = await instance.inject({ method: 'POST', url: '/api/library/scan' });
      expect(scan.statusCode).toBe(200);
      expect(scan.json()).toMatchObject({ total: 5 });
      const paths = (await listVideos(instance)).items.map((item) => item.relativePath);
      expect(paths).toContain('Novo Filme.webm');
      expect(paths).not.toContain('Filme.Exemplo_2020.mp4');
    } finally {
      await instance.close();
      await isolated.cleanup();
    }
  });
});

describe('rotas auxiliares', () => {
  it('GET / serve a página de teste', async () => {
    const response = await app.inject({ method: 'GET', url: '/' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('Home Media Server');
  });

  it('rota desconhecida retorna 404 em JSON', async () => {
    const response = await app.inject({ method: 'GET', url: '/nao-existe' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: 'ROUTE_NOT_FOUND' } });
  });
});

function streamUrlFor(video: VideoDto): string {
  return video.streamUrl;
}
