import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { describe as describeSource, parseIptvSources } from '../src/iptv/iptv.service.js';
import { parseM3u } from '../src/iptv/m3u-parser.js';
import { createFixtureLibrary, testConfig } from './helpers.js';

const M3U = `#EXTM3U url-tvg="http://epg.exemplo/guia.xml"
#EXTINF:-1 tvg-id="tv1" tvg-logo="http://logos.exemplo/tv1.png" group-title="Notícias",TV Um, ao vivo
http://streams.exemplo/tv1/index.m3u8
#EXTINF:-1 group-title="Esportes" tvg-logo="logo-relativo.png",Esporte HD
https://streams.exemplo/esporte.ts
#EXTINF:-1,Sem Grupo
#EXTGRP:Infantil
http://streams.exemplo/kids.m3u8
#EXTINF:-1 group-title="Notícias",Duplicado
http://streams.exemplo/tv1/index.m3u8
#EXTINF:-1,Sem URL válida
rtmp://streams.exemplo/x
`;

describe('parseM3u', () => {
  it('lê nome, grupo, logo e URL; ignora duplicados e protocolos não suportados', () => {
    const channels = parseM3u(M3U);
    expect(channels.map((c) => [c.name, c.group, c.logo, c.url])).toEqual([
      ['TV Um, ao vivo', 'Notícias', 'http://logos.exemplo/tv1.png', 'http://streams.exemplo/tv1/index.m3u8'],
      ['Esporte HD', 'Esportes', null, 'https://streams.exemplo/esporte.ts'],
      ['Sem Grupo', 'Infantil', null, 'http://streams.exemplo/kids.m3u8'],
    ]);
    expect(channels[0]?.id).toMatch(/^[a-f0-9]{16}$/);
    expect(parseM3u(M3U)[0]?.id).toBe(channels[0]?.id); // ID estável
  });

  it('separa fontes e esconde credenciais da URL nos logs', () => {
    expect(parseIptvSources(' a.m3u | https://x/y.m3u ')).toEqual(['a.m3u', 'https://x/y.m3u']);
    expect(describeSource('http://user:senha@host/get.php?username=u&password=p')).toBe('http://host/…');
    expect(describeSource('http://host/p/12345/67890/m3u')).toBe('http://host/…');
  });
});

describe('GET /api/iptv/channels', () => {
  it('retorna os canais de um arquivo .m3u configurado', async () => {
    const library = await createFixtureLibrary();
    const list = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'iptv-')), 'canais.m3u');
    await fs.writeFile(list, M3U);
    const app = await buildApp(testConfig(library.root, { iptvSources: [list] }));
    try {
      const body = (await app.inject({ method: 'GET', url: '/api/iptv/channels' })).json<{ configured: boolean; total: number; items: unknown[] }>();
      expect(body).toMatchObject({ configured: true, total: 3 });
      const groups = (await app.inject({ method: 'GET', url: '/api/iptv/groups' })).json<{ items: unknown[] }>();
      expect(groups.items).toEqual([
        { name: 'Notícias', count: 1 },
        { name: 'Esportes', count: 1 },
        { name: 'Infantil', count: 1 },
      ]);
      const sports = (await app.inject({ method: 'GET', url: `/api/iptv/channels?group=${encodeURIComponent('Esportes')}` })).json<{ total: number; items: { name: string }[] }>();
      expect(sports.total).toBe(1);
      expect(sports.items[0]?.name).toBe('Esporte HD');
    } finally {
      await app.close();
      await library.cleanup();
    }
  });

  it('respeita o limite de tamanho configurável', async () => {
    const library = await createFixtureLibrary();
    const list = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'iptv-')), 'grande.m3u');
    await fs.writeFile(list, M3U + '#'.repeat(1024 * 1024 + 10));
    const small = await buildApp(testConfig(library.root, { iptvSources: [list], iptvMaxListMb: 1 }));
    const large = await buildApp(testConfig(library.root, { iptvSources: [list], iptvMaxListMb: 2 }));
    try {
      const rejected = (await small.inject({ method: 'GET', url: '/api/iptv/channels' })).json<{ total: number; errors: string[] }>();
      expect(rejected.total).toBe(0);
      expect(rejected.errors[0]).toMatch(/IPTV_MAX_LIST_MB/);
      expect((await large.inject({ method: 'GET', url: '/api/iptv/channels' })).json()).toMatchObject({ total: 3 });
    } finally {
      await small.close();
      await large.close();
      await library.cleanup();
    }
  });

  it('sem configuração: lista vazia; fonte inválida: erro informado sem derrubar o servidor', async () => {
    const library = await createFixtureLibrary();
    const off = await buildApp(testConfig(library.root));
    const broken = await buildApp(testConfig(library.root, { iptvSources: [path.join(library.root, 'nao-existe.m3u')] }));
    try {
      expect((await off.inject({ method: 'GET', url: '/api/iptv/channels' })).json()).toMatchObject({ configured: false, total: 0 });
      const body = (await broken.inject({ method: 'GET', url: '/api/iptv/channels' })).json<{ total: number; errors: string[] }>();
      expect(body.total).toBe(0);
      expect(body.errors).toHaveLength(1);
    } finally {
      await off.close();
      await broken.close();
      await library.cleanup();
    }
  });
});
