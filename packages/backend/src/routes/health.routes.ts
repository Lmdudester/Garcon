import type { FastifyInstance } from 'fastify';
import { config } from '../config/index.js';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };
  });

  app.get('/config', async () => {
    return {
      importPath: config.paths.hostImportDir
    };
  });
}
