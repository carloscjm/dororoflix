import Fastify, { type FastifyInstance } from 'fastify';
import type { AppConfig } from './config/env.js';
import { buildLoggerOptions } from './config/logger.js';
import { CatalogService } from './library/catalog.service.js';
import { IptvService } from './iptv/iptv.service.js';
import { loadOverridesFile } from './library/metadata-overrides.js';
import { LocalFileSource } from './library/sources/local-source.js';
import { PUBLIC_DIR } from './paths.js';
import { registerCors } from './plugins/cors.js';
import { registerErrorHandlers } from './plugins/error-handler.js';
import { registerLanGuard } from './plugins/lan-guard.js';
import { healthRoutes } from './routes/health.routes.js';
import { iptvRoutes } from './routes/iptv.routes.js';
import { libraryRoutes } from './routes/library.routes.js';
import { seriesRoutes } from './routes/series.routes.js';
import { videosRoutes } from './routes/videos.routes.js';
import { webRoutes } from './routes/web.routes.js';
import { StreamingService } from './streaming/streaming.service.js';

export interface BuildAppOptions {
  /** Sobrescreve a pasta da página de teste (útil em testes). */
  readonly publicDir?: string;
}

/**
 * Monta a aplicação (composition root): cria serviços, registra plugins e rotas
 * e executa o scan inicial. Não abre a porta — isso fica a cargo de `server.ts`.
 */
export async function buildApp(config: AppConfig, options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: buildLoggerOptions(config),
    trustProxy: false, // IP real do socket; não confiar em X-Forwarded-For
  });

  registerErrorHandlers(app);
  if (config.lanOnly) registerLanGuard(app);
  await registerCors(app, config.corsOrigins);

  // Origens de mídia: adicionar aqui, no futuro, uma GoogleDriveSource.
  const localSource = await LocalFileSource.create(config.mediaRoot, app.log);
  const catalog = new CatalogService([localSource], app.log, () =>
    loadOverridesFile(config.metadataOverridesFile, (details, message) => app.log.warn(details, message)),
  );
  const streaming = new StreamingService(catalog);
  const iptv = new IptvService(
    config.iptvSources,
    app.log.child({ module: 'iptv' }),
    fetch,
    config.iptvMaxListMb * 1024 * 1024,
  );

  await app.register(healthRoutes, { catalog });
  await app.register(videosRoutes, { catalog, streaming });
  await app.register(seriesRoutes, { catalog });
  await app.register(libraryRoutes, { catalog, iptv });
  await app.register(iptvRoutes, { iptv });
  await app.register(webRoutes, { publicDir: options.publicDir ?? PUBLIC_DIR });

  app.log.info({ mediaRoot: config.mediaRoot }, 'Lendo biblioteca de vídeos...');
  await catalog.scan();
  void iptv.refresh(); // em segundo plano: uma lista lenta não atrasa a inicialização

  return app;
}
