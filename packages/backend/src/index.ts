import { startServer } from './app.js';
import { initializeDataDirectory } from './services/file-manager.service.js';
import { templateService } from './services/template.service.js';
import { dockerProvider } from './services/docker-execution.provider.js';
import { nativeProvider } from './services/native-execution.provider.js';
import { serverService } from './services/server.service.js';
import { maintenanceService } from './services/maintenance.service.js';
import { webAppService } from './services/web-app.service.js';
import { logger } from './utils/logger.js';

async function main() {
  try {
    logger.info('Starting Garcon server...');

    await initializeDataDirectory();
    logger.info('Data directory initialized');

    await templateService.initializeDefaultTemplates();
    logger.info('Default templates initialized');

    try {
      await dockerProvider.reconcile();
      logger.info('Docker containers reconciled');
    } catch (error) {
      logger.warn({ error }, 'Docker reconciliation failed (Docker may not be running)');
    }

    await nativeProvider.reconcile();
    logger.info('Native processes reconciled');

    await serverService.initialize();
    logger.info('Server service initialized');

    await webAppService.initialize();
    logger.info('Web app service initialized');

    maintenanceService.initialize();
    logger.info('Maintenance service initialized');

    await startServer();
  } catch (error) {
    logger.error(error, 'Failed to start Garcon');
    process.exit(1);
  }
}

main();
