import path from 'path';
import fs from 'fs/promises';
import archiver from 'archiver';
import { createWriteStream } from 'fs';
import type { BackupType, BackupResponse } from '@garcon/shared';
import { config } from '../config/index.js';
import { createChildLogger } from '../utils/logger.js';
import { NotFoundError, ServerStateError } from '../utils/errors.js';
import {
  pathExists,
  listFiles,
  deleteDirectory,
  getDirectorySize
} from './file-manager.service.js';

const logger = createChildLogger('backup-service');

class BackupService {
  private getBackupDir(serverId: string): string {
    return path.join(config.paths.backupsDir, serverId);
  }

  private getBackupFileName(timestamp: string, type: BackupType): string {
    const sanitizedTimestamp = timestamp.replace(/[:.]/g, '-');
    return `backup-${sanitizedTimestamp}-${type}.tar.gz`;
  }

  private parseBackupFileName(
    fileName: string
  ): { timestamp: string; type: BackupType } | null {
    const match = fileName.match(/^backup-(.+)-(manual|auto|pre-update)\.tar\.gz$/);
    if (!match) return null;

    // Sanitized format: YYYY-MM-DDTHH-mm-ss-SSSZ
    // Original format:  YYYY-MM-DDTHH:mm:ss.SSSZ
    const sanitized = match[1]!;
    const tsMatch = sanitized.match(
      /^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3}Z)$/
    );

    if (!tsMatch) {
      // Fallback: try to parse as-is (might be a legacy format)
      return {
        timestamp: sanitized,
        type: match[2] as BackupType
      };
    }

    // Reconstruct: YYYY-MM-DDTHH:mm:ss.SSSZ
    const timestamp = `${tsMatch[1]}:${tsMatch[2]}:${tsMatch[3]}.${tsMatch[4]}`;

    return {
      timestamp,
      type: match[2] as BackupType
    };
  }

  async listBackups(serverId: string): Promise<BackupResponse[]> {
    const backupDir = this.getBackupDir(serverId);

    if (!(await pathExists(backupDir))) {
      return [];
    }

    const files = await listFiles(backupDir, '.tar.gz');
    const backups: BackupResponse[] = [];

    for (const fileName of files) {
      const parsed = this.parseBackupFileName(fileName);
      if (!parsed) continue;

      const filePath = path.join(backupDir, fileName);
      try {
        const stats = await fs.stat(filePath);
        backups.push({
          serverId,
          timestamp: parsed.timestamp,
          type: parsed.type,
          size: stats.size,
          fileName,
          filePath
        });
      } catch {
        logger.warn({ serverId, fileName }, 'Failed to stat backup file');
      }
    }

    backups.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return backups;
  }

  async createBackup(
    serverId: string,
    type: BackupType,
    description?: string
  ): Promise<BackupResponse> {
    const serverPath = path.join(config.paths.serversDir, serverId);

    if (!(await pathExists(serverPath))) {
      throw new NotFoundError('Server', serverId);
    }

    const backupDir = this.getBackupDir(serverId);
    await fs.mkdir(backupDir, { recursive: true });

    const timestamp = new Date().toISOString();
    const fileName = this.getBackupFileName(timestamp, type);
    const backupPath = path.join(backupDir, fileName);

    await this.createArchive(serverPath, backupPath);

    const stats = await fs.stat(backupPath);

    await this.enforceRetentionPolicy(serverId);

    logger.info({ serverId, type, fileName }, 'Backup created');

    return {
      serverId,
      timestamp,
      type,
      size: stats.size,
      description,
      fileName,
      filePath: backupPath
    };
  }

  async deleteBackup(serverId: string, timestamp: string): Promise<void> {
    const backupDir = this.getBackupDir(serverId);
    const files = await listFiles(backupDir, '.tar.gz');

    let found = false;
    for (const fileName of files) {
      const parsed = this.parseBackupFileName(fileName);
      if (parsed && parsed.timestamp === timestamp) {
        const filePath = path.join(backupDir, fileName);
        await fs.unlink(filePath);
        found = true;
        logger.info({ serverId, timestamp, fileName }, 'Backup deleted');
        break;
      }
    }

    if (!found) {
      throw new NotFoundError('Backup', timestamp);
    }
  }

  async deleteAllBackups(serverId: string): Promise<void> {
    const backupDir = this.getBackupDir(serverId);
    if (await pathExists(backupDir)) {
      await deleteDirectory(backupDir);
      logger.info({ serverId }, 'All backups deleted');
    }
  }

  private async createArchive(sourcePath: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = createWriteStream(destPath);
      const archive = archiver('tar', { gzip: true, gzipOptions: { level: 6 } });

      output.on('close', () => {
        logger.debug({ destPath, size: archive.pointer() }, 'Archive created');
        resolve();
      });

      archive.on('error', (err) => {
        logger.error({ err, destPath }, 'Archive error');
        reject(err);
      });

      archive.pipe(output);
      archive.directory(sourcePath, false);
      archive.finalize();
    });
  }

  private async enforceRetentionPolicy(serverId: string): Promise<void> {
    const backups = await this.listBackups(serverId);
    const maxBackups = config.backup.maxBackupsPerServer;

    if (backups.length <= maxBackups) {
      return;
    }

    const toDelete = backups.slice(maxBackups);
    for (const backup of toDelete) {
      await this.deleteBackup(serverId, backup.timestamp);
    }

    logger.info(
      { serverId, deleted: toDelete.length },
      'Retention policy enforced'
    );
  }
}

export const backupService = new BackupService();
