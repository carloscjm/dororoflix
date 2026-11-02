import type { FastifyPluginAsync } from 'fastify';
import { artworkNotFound, seriesNotFound } from '../errors/app-error.js';
import type { CatalogService } from '../library/catalog.service.js';
import type { SeriesItem } from '../library/types.js';
import { sendArtwork } from './media-files.js';
import {
  errorSchema,
  seriesDetailSchema,
  seriesListSchema,
  toSeriesDetailDto,
  toSeriesSummaryDto,
  videoIdParamsSchema,
  type SeriesDetailDto,
  type SeriesListDto,
} from './schemas.js';

export interface SeriesRoutesOptions {
  readonly catalog: CatalogService;
}

interface SeriesIdParams {
  readonly id: string;
}

/** Séries montadas a partir dos episódios identificados no catálogo. */
export const seriesRoutes: FastifyPluginAsync<SeriesRoutesOptions> = async (app, { catalog }) => {
  const findOrThrow = (id: string): SeriesItem => {
    const series = catalog.getSeries(id);
    if (!series) throw seriesNotFound(id);
    return series;
  };

  app.get<{ Reply: SeriesListDto }>(
    '/api/series',
    { schema: { response: { 200: seriesListSchema } } },
    async () => {
      const items = catalog.listSeries().map(toSeriesSummaryDto);
      return { total: items.length, items };
    },
  );

  app.get<{ Params: SeriesIdParams; Reply: SeriesDetailDto }>(
    '/api/series/:id',
    { schema: { params: videoIdParamsSchema, response: { 200: seriesDetailSchema, '4xx': errorSchema } } },
    async (request) => toSeriesDetailDto(findOrThrow(request.params.id)),
  );

  app.get<{ Params: SeriesIdParams }>(
    '/api/series/:id/artwork',
    { schema: { params: videoIdParamsSchema } },
    async (request, reply) => {
      const series = findOrThrow(request.params.id);
      if (!series.artwork) throw artworkNotFound();
      return sendArtwork(reply, catalog, series.sourceId, series.artwork);
    },
  );
};
