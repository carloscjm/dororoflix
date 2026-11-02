import os from 'node:os';
import { config as loadDotenv } from 'dotenv';
import { buildApp } from './app.js';
import { ConfigError, loadConfig, type AppConfig } from './config/env.js';

loadDotenv({ quiet: true });

function lanAddresses(): string[] {
  return Object.values(os.networkInterfaces())
    .flatMap((addresses) => addresses ?? [])
    .filter((address) => address.family === 'IPv4' && !address.internal)
    .map((address) => address.address);
}

async function main(): Promise<void> {
  let config: AppConfig;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }

  const app = await buildApp(config);

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'Encerrando servidor...');
    try {
      await app.close();
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, 'Erro ao encerrar');
      process.exit(1);
    }
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: config.host, port: config.port });

  const isAllInterfaces = config.host === '0.0.0.0' || config.host === '::';
  const urls = isAllInterfaces
    ? ['localhost', ...lanAddresses()].map((host) => `http://${host}:${config.port}`)
    : [`http://${config.host}:${config.port}`];
  app.log.info({ urls }, 'Servidor de mídia disponível');
}

main().catch((error: unknown) => {
  console.error('Falha ao iniciar o servidor:', error);
  process.exit(1);
});
