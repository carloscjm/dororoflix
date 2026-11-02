import type { FastifyPluginAsync } from 'fastify';
import type { CatalogService } from '../library/catalog.service.js';
import { scanResultSchema, toScanResultDto, type ScanResultDto } from './schemas.js';

export interface LibraryRoutesOptions {
  readonly catalog: CatalogService;
}

/** Endpoint auxiliar: atualiza o catálogo após adicionar filmes, sem reiniciar o servidor. */
export const libraryRoutes: FastifyPluginAsync<LibraryRoutesOptions> = async (app, { catalog }) => {
  app.post<{ Reply: ScanResultDto }>(
    '/api/library/scan',
    { schema: { response: { 200: scanResultSchema } } },
    async () => toScanResultDto(await catalog.scan()),
  );
};
