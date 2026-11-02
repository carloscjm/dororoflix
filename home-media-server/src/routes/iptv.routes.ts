import type { FastifyPluginAsync } from 'fastify';
import type { IptvService } from '../iptv/iptv.service.js';
import type { Channel } from '../iptv/m3u-parser.js';

export interface IptvRoutesOptions {
  readonly iptv: IptvService;
}

const channelSchema = {
  type: 'object',
  required: ['id', 'name', 'group', 'logo', 'url'],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    group: { type: 'string' },
    logo: { type: ['string', 'null'] },
    url: { type: 'string' },
  },
} as const;

const statusProperties = {
  configured: { type: 'boolean' },
  total: { type: 'integer' },
  loadedAt: { type: ['string', 'null'], format: 'date-time' },
  errors: { type: 'array', items: { type: 'string' } },
} as const;

interface ChannelsQuery {
  readonly group?: string;
}

/**
 * Canais das listas IPTV configuradas. Listas grandes são entregues por partes:
 * primeiro as categorias (/groups), depois os canais de uma categoria (?group=).
 * A TV toca o stream direto da origem.
 */
export const iptvRoutes: FastifyPluginAsync<IptvRoutesOptions> = async (app, { iptv }) => {
  const status = (items: readonly Channel[]) => {
    const current = iptv.status();
    return {
      configured: current.configured,
      total: items.length,
      loadedAt: current.loadedAt ? current.loadedAt.toISOString() : null,
      errors: current.errors,
    };
  };

  app.get(
    '/api/iptv/groups',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            required: ['configured', 'total', 'loadedAt', 'errors', 'items'],
            properties: {
              ...statusProperties,
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['name', 'count'],
                  properties: { name: { type: 'string' }, count: { type: 'integer' } },
                },
              },
            },
          },
        },
      },
    },
    async () => {
      const channels = await iptv.list();
      const counts = new Map<string, number>();
      for (const channel of channels) counts.set(channel.group, (counts.get(channel.group) ?? 0) + 1);
      return { ...status(channels), items: [...counts].map(([name, count]) => ({ name, count })) };
    },
  );

  app.get<{ Querystring: ChannelsQuery }>(
    '/api/iptv/channels',
    {
      schema: {
        querystring: { type: 'object', properties: { group: { type: 'string', maxLength: 500 } } },
        response: {
          200: {
            type: 'object',
            required: ['configured', 'total', 'loadedAt', 'errors', 'items'],
            properties: { ...statusProperties, items: { type: 'array', items: channelSchema } },
          },
        },
      },
    },
    async (request) => {
      const all = await iptv.list();
      const group = request.query.group;
      const items = group === undefined ? all : all.filter((channel) => channel.group === group);
      return { ...status(all), total: items.length, items };
    },
  );
};
