import { createReadStream } from 'node:fs';
import path from 'node:path';
import type { FastifyPluginAsync } from 'fastify';

export interface WebRoutesOptions {
  readonly publicDir: string;
}

/** Página HTML simples para testar catálogo e reprodução no navegador. */
export const webRoutes: FastifyPluginAsync<WebRoutesOptions> = async (app, { publicDir }) => {
  const indexFile = path.join(publicDir, 'index.html');

  app.get('/', async (_request, reply) => {
    return reply
      .type('text/html; charset=utf-8')
      .header('Cache-Control', 'no-cache')
      .send(createReadStream(indexFile));
  });
};
