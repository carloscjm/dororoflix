import { describe, expect, it, vi } from 'vitest';
import { ApiError, MediaApi, normalizeServerUrl, validateServerAddress, type FetchLike } from '../src/api/media-api';

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('endereço do servidor', () => {
  it('normaliza IP:porta', () => {
    expect(normalizeServerUrl('192.168.15.165:8080')).toBe('http://192.168.15.165:8080');
    expect(normalizeServerUrl(' http://pc.local:8080/ ')).toBe('http://pc.local:8080');
    expect(normalizeServerUrl('')).toBe('');
  });

  it('valida e recusa localhost (na TV seria a própria TV)', () => {
    expect(validateServerAddress('192.168.15.165:8080')).toBeNull();
    expect(validateServerAddress('localhost:8080')).toMatch(/localhost/);
    expect(validateServerAddress('127.0.0.1:8080')).toMatch(/localhost/);
    expect(validateServerAddress('192.168.15.165')).toMatch(/porta/);
    expect(validateServerAddress('')).toMatch(/Informe/);
    expect(validateServerAddress('192.168.0.1:99999')).toMatch(/inválido/);
  });
});

describe('MediaApi', () => {
  it('monta URLs absolutas a partir do endereço configurado', async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(json({ total: 0, scannedAt: null, items: [] }));
    const api = new MediaApi({ baseUrl: () => '192.168.15.165:8080', fetch: fetchMock });
    await api.listVideos();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://192.168.15.165:8080/api/videos');
    expect(api.resolve('/api/videos/abc/stream')).toBe('http://192.168.15.165:8080/api/videos/abc/stream');
  });

  it('usa POST para atualizar a biblioteca', async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(json({ total: 3, durationMs: 10, scannedAt: 'x' }));
    const api = new MediaApi({ baseUrl: () => '10.0.0.2:8080', fetch: fetchMock });
    await expect(api.scanLibrary()).resolves.toMatchObject({ total: 3 });
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
  });

  it('converte erros HTTP do backend em ApiError com código', async () => {
    const api = new MediaApi({
      baseUrl: () => '10.0.0.2:8080',
      fetch: async () => json({ error: { code: 'VIDEO_NOT_FOUND', message: 'Vídeo não encontrado.' } }, 404),
    });
    await expect(api.getVideo('x')).rejects.toMatchObject({ kind: 'http', status: 404, code: 'VIDEO_NOT_FOUND', message: 'Vídeo não encontrado.' });
  });

  it('distingue falha de rede e tempo esgotado', async () => {
    const offline = new MediaApi({ baseUrl: () => '10.0.0.2:8080', fetch: async () => Promise.reject(new TypeError('Failed to fetch')) });
    await expect(offline.health()).rejects.toMatchObject({ kind: 'network' });

    const slow = new MediaApi({
      baseUrl: () => '10.0.0.2:8080',
      timeoutMs: 20,
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('abort', 'AbortError')))),
    });
    await expect(slow.listSeries()).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('acusa resposta que não é JSON', async () => {
    const api = new MediaApi({ baseUrl: () => '10.0.0.2:8080', fetch: async () => new Response('<html>', { status: 200 }) });
    await expect(api.listVideos()).rejects.toBeInstanceOf(ApiError);
  });
});
