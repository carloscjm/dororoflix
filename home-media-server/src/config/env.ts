import path from 'node:path';
import { z } from 'zod';
import { parseIptvSources } from '../iptv/iptv.service.js';

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export type CorsOrigins = '*' | readonly string[];

export interface AppConfig {
  readonly env: 'development' | 'production' | 'test';
  /** Caminho absoluto da pasta de vídeos. */
  readonly mediaRoot: string;
  readonly host: string;
  readonly port: number;
  readonly logLevel: LogLevel;
  readonly logPretty: boolean;
  /** Recusa requisições vindas de IPs fora de redes privadas/locais. */
  readonly lanOnly: boolean;
  /** Lista vazia = CORS desativado. */
  readonly corsOrigins: CorsOrigins;
  /** JSON opcional com correções manuais de metadados (séries/episódios). */
  readonly metadataOverridesFile: string | null;
  /** Listas IPTV (URLs ou arquivos .m3u). Vazio = TV ao vivo desativada. */
  readonly iptvSources: readonly string[];
  /** Tamanho máximo de cada lista IPTV, em MB. */
  readonly iptvMaxListMb: number;
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  MEDIA_ROOT: z.string().trim().min(1).default('E:\\Filmes'),
  HOST: z.string().trim().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  LOG_PRETTY: z.stringbool().default(false),
  LAN_ONLY: z.stringbool().default(true),
  CORS_ORIGINS: z.string().default(''),
  METADATA_OVERRIDES_FILE: z.string().trim().min(1).optional(),
  IPTV_SOURCE: z.string().optional(),
  IPTV_MAX_LIST_MB: z.coerce.number().int().min(1).max(500).default(50),
});

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function parseCorsOrigins(raw: string): CorsOrigins {
  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  return origins.includes('*') ? '*' : origins;
}

/**
 * Lê e valida a configuração a partir das variáveis de ambiente.
 * Variáveis definidas com valor vazio (ex.: `PORT=`) são tratadas como ausentes.
 */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value.trim() !== '') cleaned[key] = value;
  }

  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    throw new ConfigError(`Configuração inválida:\n${z.prettifyError(result.error)}`);
  }

  const env = result.data;
  return {
    env: env.NODE_ENV,
    mediaRoot: path.resolve(env.MEDIA_ROOT),
    host: env.HOST,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    logPretty: env.LOG_PRETTY,
    lanOnly: env.LAN_ONLY,
    corsOrigins: parseCorsOrigins(env.CORS_ORIGINS),
    metadataOverridesFile: env.METADATA_OVERRIDES_FILE ? path.resolve(env.METADATA_OVERRIDES_FILE) : null,
    iptvSources: parseIptvSources(env.IPTV_SOURCE),
    iptvMaxListMb: env.IPTV_MAX_LIST_MB,
  };
}
