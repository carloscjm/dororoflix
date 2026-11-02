import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';
import type { CorsOrigins } from '../config/env.js';

/**
 * CORS para clientes de outra origem (ex.: app Tizen empacotado).
 * Lista vazia = desativado. Expõe os cabeçalhos de Range para que players
 * baseados em JavaScript (Shaka, hls.js, AVPlay via fetch) consigam lê-los.
 */
export async function registerCors(app: FastifyInstance, origins: CorsOrigins): Promise<void> {
  if (origins !== '*' && origins.length === 0) return;

  await app.register(cors, {
    origin: origins === '*' ? true : [...origins],
    methods: ['GET', 'HEAD', 'POST', 'OPTIONS'],
    allowedHeaders: ['Range', 'If-Range', 'Content-Type'],
    exposedHeaders: ['Content-Range', 'Content-Length', 'Accept-Ranges', 'ETag', 'Last-Modified'],
    maxAge: 600,
  });
}
