import path from 'path';
import { fileURLToPath } from 'url';
import { config as dotenvConfig } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables from .env file (for local development)
// This runs before loadConfig() is called, ensuring env vars are available
dotenvConfig({ path: path.resolve(__dirname, '../../../../.env') });

export interface Config {
  server: {
    host: string;
    port: number;
  };
  paths: {
    dataDir: string;
    hostDataDir: string; // Host path for Docker bind mounts (Docker-in-Docker)
    configDir: string;
    serversDir: string;
    backupsDir: string;
    templatesDir: string;
    logsDir: string;
    importDir: string; // Directory for importing server files (mounted in Docker)
    hostImportDir: string; // Host path for import directory (for display to users)
  };
  docker: {
    socketPath: string;
    containerPrefix: string;
    defaultStopTimeout: number;
  };
  backup: {
    maxBackupsPerType: number;
    autoBackupOnStop: boolean;
  };
  logging: {
    level: string;
    pretty: boolean;
  };
}

function getDataDir(): string {
  return process.env['GARCON_DATA_DIR'] || path.resolve(__dirname, '../../../../garcon-data');
}

function getHostDataDir(dataDir: string): string {
  // For Docker-in-Docker: use GARCON_HOST_DATA_DIR for bind mounts
  // This should be the path on the Docker host, not inside this container
  return process.env['GARCON_HOST_DATA_DIR'] || dataDir;
}

function getImportDir(): string {
  return process.env['GARCON_IMPORT_DIR'] || '/garcon-import';
}

function getHostImportDir(importDir: string): string {
  // For display to users: show the host path if configured
  return process.env['GARCON_HOST_IMPORT_DIR'] || importDir;
}

function getDockerSocketPath(): string {
  if (process.env['DOCKER_HOST']) {
    return process.env['DOCKER_HOST'];
  }
  return process.platform === 'win32'
    ? '//./pipe/docker_engine'
    : '/var/run/docker.sock';
}

export function loadConfig(): Config {
  const dataDir = getDataDir();
  const hostDataDir = getHostDataDir(dataDir);
  const importDir = getImportDir();
  const hostImportDir = getHostImportDir(importDir);

  return {
    server: {
      host: process.env['HOST'] || '0.0.0.0',
      port: parseInt(process.env['PORT'] || '3001', 10)
    },
    paths: {
      dataDir,
      hostDataDir,
      configDir: path.join(dataDir, 'config'),
      serversDir: path.join(dataDir, 'servers'),
      backupsDir: path.join(dataDir, 'backups'),
      templatesDir: path.join(dataDir, 'templates'),
      logsDir: path.join(dataDir, 'logs'),
      importDir,
      hostImportDir
    },
    docker: {
      socketPath: getDockerSocketPath(),
      containerPrefix: 'garcon-',
      defaultStopTimeout: 30
    },
    backup: {
      maxBackupsPerType: parseInt(process.env['MAX_BACKUPS_PER_TYPE'] || '5', 10),
      autoBackupOnStop: process.env['AUTO_BACKUP_ON_STOP'] !== 'false'
    },
    logging: {
      level: process.env['LOG_LEVEL'] || 'info',
      pretty: process.env['LOG_PRETTY'] !== 'false'
    }
  };
}

export const config = loadConfig();
