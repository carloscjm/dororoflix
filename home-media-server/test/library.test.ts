import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig, parseCorsOrigins } from '../src/config/env.js';
import { detectFormat } from '../src/library/formats.js';
import { titleFromFileName } from '../src/library/title.js';
import { createVideoId } from '../src/library/video-id.js';

describe('createVideoId', () => {
  it('é determinístico e tem 16 caracteres hexadecimais', () => {
    const id = createVideoId('local', 'Séries/ep1.mkv');
    expect(id).toMatch(/^[a-f0-9]{16}$/);
    expect(createVideoId('local', 'Séries/ep1.mkv')).toBe(id);
  });

  it('diferencia caminhos e origens', () => {
    expect(createVideoId('local', 'a.mp4')).not.toBe(createVideoId('local', 'b.mp4'));
    expect(createVideoId('local', 'a.mp4')).not.toBe(createVideoId('gdrive', 'a.mp4'));
  });

  it('ignora maiúsculas quando o sistema de arquivos não diferencia (Windows)', () => {
    expect(createVideoId('local', 'Filme.MP4', true)).toBe(createVideoId('local', 'filme.mp4', true));
    expect(createVideoId('local', 'Filme.MP4', false)).not.toBe(createVideoId('local', 'filme.mp4', false));
  });

  it('normaliza Unicode (NFC e NFD geram o mesmo ID)', () => {
    expect(createVideoId('local', 'Ação.mp4'.normalize('NFD'))).toBe(createVideoId('local', 'Ação.mp4'));
  });
});

describe('detectFormat / titleFromFileName', () => {
  it('reconhece os cinco formatos sem diferenciar caixa', () => {
    expect(['a.mp4', 'a.MKV', 'a.avi', 'a.Mov', 'a.webm'].map(detectFormat)).toEqual([
      'mp4',
      'mkv',
      'avi',
      'mov',
      'webm',
    ]);
    expect(detectFormat('a.txt')).toBeNull();
    expect(detectFormat('mp4')).toBeNull();
  });

  it('gera títulos legíveis', () => {
    expect(titleFromFileName('O.Auto.da.Compadecida_2000.mp4')).toBe('O Auto da Compadecida 2000');
    expect(titleFromFileName('Cidade de Deus.mkv')).toBe('Cidade de Deus');
  });
});

describe('loadConfig', () => {
  it('usa padrões quando nada é informado', () => {
    const config = loadConfig({});
    expect(config.port).toBe(8080);
    expect(config.host).toBe('0.0.0.0');
    expect(config.lanOnly).toBe(true);
    expect(config.corsOrigins).toEqual([]);
  });

  it('lê variáveis e trata valores vazios como ausentes', () => {
    const config = loadConfig({ PORT: '9000', LAN_ONLY: 'false', LOG_PRETTY: '1', HOST: '' });
    expect(config.port).toBe(9000);
    expect(config.lanOnly).toBe(false);
    expect(config.logPretty).toBe(true);
    expect(config.host).toBe('0.0.0.0');
  });

  it('rejeita valores inválidos com ConfigError', () => {
    expect(() => loadConfig({ PORT: '70000' })).toThrow(ConfigError);
    expect(() => loadConfig({ LAN_ONLY: 'talvez' })).toThrow(ConfigError);
  });

  it('interpreta CORS_ORIGINS', () => {
    expect(parseCorsOrigins('')).toEqual([]);
    expect(parseCorsOrigins(' http://a.local , null ')).toEqual(['http://a.local', 'null']);
    expect(parseCorsOrigins('http://a.local,*')).toBe('*');
  });
});
