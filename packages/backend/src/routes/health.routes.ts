import type { FastifyInstance } from 'fastify';
import { config } from '../config/index.js';
import { listDirectories } from '../services/file-manager.service.js';

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

  app.get('/import/folders', async () => {
    const folders = await listDirectories(config.paths.importDir);
    return { folders };
  });
}
