import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AppConfig } from '../src/config/env.js';

export const MOVIE_SIZE = 1000;

export interface FixtureLibrary {
  readonly root: string;
  /** Pasta irmã da raiz, fora da biblioteca (para testes de path traversal). */
  readonly outside: string;
  /** Conteúdo do arquivo principal: byte i = i % 256. */
  readonly movieBytes: Buffer;
  cleanup(): Promise<void>;
}

/**
 * Cria uma biblioteca falsa em uma pasta temporária:
 *
 *   Filme.Exemplo_2020.mp4      (1000 bytes, conteúdo previsível)
 *   vazio.mov                   (0 bytes)
 *   leia-me.txt                 (ignorado)
 *   Séries/clipe.WEBM           (extensão maiúscula)
 *   Séries/Temporada 1/Episodio_01.mkv
 *   Séries/Temporada 1/antigo.avi
 */
export async function createFixtureLibrary(): Promise<FixtureLibrary> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'media-server-test-'));
  const root = path.join(base, 'Filmes');
  const outside = path.join(base, 'fora');
  const season = path.join(root, 'Séries', 'Temporada 1');

  await fs.mkdir(season, { recursive: true });
  await fs.mkdir(outside, { recursive: true });

  const movieBytes = Buffer.from(Array.from({ length: MOVIE_SIZE }, (_, i) => i % 256));
  await fs.writeFile(path.join(root, 'Filme.Exemplo_2020.mp4'), movieBytes);
  await fs.writeFile(path.join(root, 'vazio.mov'), Buffer.alloc(0));
  await fs.writeFile(path.join(root, 'leia-me.txt'), 'não é vídeo');
  await fs.writeFile(path.join(root, 'Séries', 'clipe.WEBM'), Buffer.alloc(50, 7));
  await fs.writeFile(path.join(season, 'Episodio_01.mkv'), Buffer.alloc(200, 1));
  await fs.writeFile(path.join(season, 'antigo.avi'), Buffer.alloc(30, 2));
  await fs.writeFile(path.join(outside, 'segredo.mp4'), 'conteúdo fora da biblioteca');

  return {
    root,
    outside,
    movieBytes,
    cleanup: () => fs.rm(base, { recursive: true, force: true }),
  };
}

export function testConfig(mediaRoot: string, overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    env: 'test',
    mediaRoot,
    host: '127.0.0.1',
    port: 0,
    logLevel: 'silent',
    logPretty: false,
    lanOnly: true,
    corsOrigins: [],
    metadataOverridesFile: null,
    iptvSources: [],
    iptvMaxListMb: 50,
    ...overrides,
  };
}
