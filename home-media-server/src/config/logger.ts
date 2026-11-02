import type { FastifyServerOptions } from 'fastify';
import type { AppConfig } from './env.js';

/** Configuração do logger (pino) usada pelo Fastify. */
export function buildLoggerOptions(config: AppConfig): NonNullable<FastifyServerOptions['logger']> {
  return {
    level: config.logLevel,
    // Evita vazar cabeçalhos sensíveis caso futuramente haja autenticação.
    redact: ['req.headers.authorization', 'req.headers.cookie'],
    ...(config.logPretty
      ? {
          transport: {
            target: 'pino-pretty',
            options: { translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname', singleLine: true },
          },
        }
      : {}),
  };
}
