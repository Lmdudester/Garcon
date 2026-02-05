import { startServer } from './app.js';
import { initializeDataDirectory } from './services/file-manager.service.js';
import { templateService } from './services/template.service.js';
import { dockerManager } from './services/docker-manager.service.js';
import { serverService } from './services/server.service.js';
import { maintenanceService } from './services/maintenance.service.js';
import { logger } from './utils/logger.js';

async function main() {
  try {
    logger.info('Starting Garcon server...');

    await initializeDataDirectory();
    logger.info('Data directory initialized');

    await templateService.initializeDefaultTemplates();
    logger.info('Default templates initialized');

    await dockerManager.reconcileContainers();
    logger.info('Docker containers reconciled');

    await serverService.initialize();
    logger.info('Server service initialized');

    maintenanceService.initialize();
    logger.info('Maintenance service initialized');

    await startServer();
  } catch (error) {
    logger.error(error, 'Failed to start Garcon');
    process.exit(1);
  }
}

main();
