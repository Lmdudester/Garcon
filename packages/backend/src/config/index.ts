import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface Config {
  server: {
    host: string;
    port: number;
  };
  paths: {
    dataDir: string;
    configDir: string;
    serversDir: string;
    backupsDir: string;
    templatesDir: string;
    logsDir: string;
  };
  docker: {
    socketPath: string;
    containerPrefix: string;
    defaultStopTimeout: number;
  };
  backup: {
    maxBackupsPerServer: number;
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

  return {
    server: {
      host: process.env['HOST'] || '0.0.0.0',
      port: parseInt(process.env['PORT'] || '3001', 10)
    },
    paths: {
      dataDir,
      configDir: path.join(dataDir, 'config'),
      serversDir: path.join(dataDir, 'servers'),
      backupsDir: path.join(dataDir, 'backups'),
      templatesDir: path.join(dataDir, 'templates'),
      logsDir: path.join(dataDir, 'logs')
    },
    docker: {
      socketPath: getDockerSocketPath(),
      containerPrefix: 'garcon-',
      defaultStopTimeout: 30
    },
    backup: {
      maxBackupsPerServer: parseInt(process.env['MAX_BACKUPS_PER_SERVER'] || '10', 10),
      autoBackupOnStop: process.env['AUTO_BACKUP_ON_STOP'] !== 'false'
    },
    logging: {
      level: process.env['LOG_LEVEL'] || 'info',
      pretty: process.env['LOG_PRETTY'] !== 'false'
    }
  };
}

export const config = loadConfig();
