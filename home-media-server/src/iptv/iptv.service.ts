import fs from 'node:fs/promises';
import type { FastifyBaseLogger } from 'fastify';
import { parseM3u, type Channel } from './m3u-parser.js';

export const DEFAULT_MAX_LIST_MB = 50;
const CACHE_MS = 30 * 60 * 1000;
const FETCH_TIMEOUT_MS = 30_000;

export interface IptvStatus {
  readonly configured: boolean;
  readonly total: number;
  readonly loadedAt: Date | null;
  readonly errors: readonly string[];
}

/**
 * Carrega listas IPTV configuradas em IPTV_SOURCE (URLs http(s) ou caminhos de
 * arquivo .m3u, separados por "|"). O resultado fica em cache por 30 min; em
 * caso de falha, mantém a última lista válida.
 */
export class IptvService {
  private channels: readonly Channel[] = [];
  private loadedAt: Date | null = null;
  private errors: string[] = [];
  private inFlight: Promise<void> | null = null;

  constructor(
    private readonly sources: readonly string[],
    private readonly logger: FastifyBaseLogger,
    private readonly fetchImpl: typeof fetch = fetch,
    /** Tamanho máximo de cada lista (IPTV_MAX_LIST_MB). */
    private readonly maxListBytes: number = DEFAULT_MAX_LIST_MB * 1024 * 1024,
  ) {}

  get configured(): boolean {
    return this.sources.length > 0;
  }

  async list(): Promise<readonly Channel[]> {
    if (!this.configured) return [];
    const stale = this.loadedAt === null || Date.now() - this.loadedAt.getTime() > CACHE_MS;
    if (stale) await this.refresh();
    return this.channels;
  }

  status(): IptvStatus {
    return { configured: this.configured, total: this.channels.length, loadedAt: this.loadedAt, errors: this.errors };
  }

  /** Recarrega todas as listas (chamado também por POST /api/library/scan). */
  refresh(): Promise<void> {
    if (!this.configured) return Promise.resolve();
    this.inFlight ??= this.load().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async load(): Promise<void> {
    const all: Channel[] = [];
    const seen = new Set<string>();
    const errors: string[] = [];
    for (const source of this.sources) {
      try {
        for (const channel of parseM3u(await this.read(source))) {
          if (seen.has(channel.id)) continue;
          seen.add(channel.id);
          all.push(channel);
        }
      } catch (error) {
        const message = `${describe(source)}: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(message);
        this.logger.warn({ err: error, source: describe(source) }, 'Falha ao carregar lista IPTV');
      }
    }
    this.errors = errors;
    // Se tudo falhou, mantém a lista anterior em vez de esvaziar a TV ao vivo.
    if (all.length > 0 || errors.length === 0) this.channels = all;
    this.loadedAt = new Date();
    this.logger.info({ total: this.channels.length, sources: this.sources.length }, 'Listas IPTV carregadas');
  }

  private async read(source: string): Promise<string> {
    if (/^https?:\/\//i.test(source)) {
      const response = await this.fetchImpl(source, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      if (text.length > this.maxListBytes) throw new Error(tooLarge(this.maxListBytes));
      return text;
    }
    const stats = await fs.stat(source);
    if (stats.size > this.maxListBytes) throw new Error(tooLarge(this.maxListBytes));
    return fs.readFile(source, 'utf8');
  }
}

function tooLarge(maxBytes: number): string {
  return `lista maior que ${Math.round(maxBytes / 1024 / 1024)} MB (ajuste IPTV_MAX_LIST_MB no .env)`;
}

/** Para logs/status: mostra só o domínio, pois usuário/senha podem vir no caminho ou na query. */
export function describe(source: string): string {
  if (!/^https?:\/\//i.test(source)) return source;
  try {
    const url = new URL(source);
    return `${url.protocol}//${url.hostname}/…`;
  } catch {
    return 'URL inválida';
  }
}

export function parseIptvSources(raw: string | undefined): string[] {
  return (raw ?? '')
    .split('|')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
