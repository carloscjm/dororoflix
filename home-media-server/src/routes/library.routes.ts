import type { FastifyPluginAsync } from 'fastify';
import type { IptvService } from '../iptv/iptv.service.js';
import type { CatalogService } from '../library/catalog.service.js';
import { scanResultSchema, toScanResultDto, type ScanResultDto } from './schemas.js';

export interface LibraryRoutesOptions {
  readonly catalog: CatalogService;
  readonly iptv?: IptvService;
}

/** Endpoint auxiliar: atualiza o catálogo após adicionar filmes, sem reiniciar o servidor. */
export const libraryRoutes: FastifyPluginAsync<LibraryRoutesOptions> = async (app, { catalog, iptv }) => {
  app.post<{ Reply: ScanResultDto }>(
    '/api/library/scan',
    { schema: { response: { 200: scanResultSchema } } },
    async () => {
      const [result] = await Promise.all([catalog.scan(), iptv?.refresh()]);
      return toScanResultDto(result);
    },
  );
};
