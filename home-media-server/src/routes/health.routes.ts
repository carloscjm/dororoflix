import type { FastifyPluginAsync } from 'fastify';
import type { CatalogService } from '../library/catalog.service.js';

export interface HealthRoutesOptions {
  readonly catalog: CatalogService;
}

export const healthRoutes: FastifyPluginAsync<HealthRoutesOptions> = async (app, { catalog }) => {
  app.get(
    '/health',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            required: ['status', 'uptimeSeconds', 'catalog'],
            properties: {
              status: { type: 'string' },
              uptimeSeconds: { type: 'integer' },
              catalog: {
                type: 'object',
                required: ['total', 'scannedAt'],
                properties: {
                  total: { type: 'integer' },
                  scannedAt: { type: ['string', 'null'], format: 'date-time' },
                },
              },
            },
          },
        },
      },
    },
    async () => {
      const lastScan = catalog.getLastScan();
      return {
        status: 'ok',
        uptimeSeconds: Math.floor(process.uptime()),
        catalog: {
          total: catalog.list().length,
          scannedAt: lastScan ? lastScan.scannedAt.toISOString() : null,
        },
      };
    },
  );
};
