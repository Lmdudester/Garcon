import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { healthRoutes } from './routes/health.routes.js';
import { serverRoutes } from './routes/server.routes.js';
import { templateRoutes } from './routes/template.routes.js';
import { backupRoutes } from './routes/backup.routes.js';
import { websocketRoutes } from './routes/websocket.routes.js';
import { errorHandler } from './middleware/error-handler.js';

export async function buildApp() {
  const app = Fastify({
    logger: false
  });

  await app.register(cors, {
    origin: true,
    credentials: true
  });

  await app.register(websocket);

  app.setErrorHandler(errorHandler);

  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(serverRoutes, { prefix: '/api' });
  await app.register(templateRoutes, { prefix: '/api' });
  await app.register(backupRoutes, { prefix: '/api' });
  await app.register(websocketRoutes, { prefix: '/ws' });

  return app;
}

export async function startServer() {
  const app = await buildApp();

  try {
    const address = await app.listen({
      host: config.server.host,
      port: config.server.port
    });
    logger.info(`Server listening at ${address}`);
    return app;
  } catch (err) {
    logger.error(err, 'Failed to start server');
    throw err;
  }
}
