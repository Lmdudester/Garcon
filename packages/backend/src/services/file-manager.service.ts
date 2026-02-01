import fs from 'fs/promises';
import path from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { config } from '../config/index.js';
import { createChildLogger } from '../utils/logger.js';
import { FileSystemError } from '../utils/errors.js';

const logger = createChildLogger('file-manager');

export async function initializeDataDirectory(): Promise<void> {
  const dirs = [
    config.paths.dataDir,
    config.paths.configDir,
    config.paths.serversDir,
    config.paths.backupsDir,
    config.paths.templatesDir,
    config.paths.logsDir
  ];

  for (const dir of dirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
      logger.debug({ dir }, 'Directory ensured');
    } catch (error) {
      logger.error({ error, dir }, 'Failed to create directory');
      throw new FileSystemError(`Failed to create directory: ${dir}`);
    }
  }
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function isDirectory(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

export async function readYaml<T>(filePath: string): Promise<T> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return parseYaml(content) as T;
  } catch (error) {
    logger.error({ error, filePath }, 'Failed to read YAML file');
    throw new FileSystemError(`Failed to read YAML file: ${filePath}`);
  }
}

export async function writeYaml<T>(filePath: string, data: T): Promise<void> {
  try {
    const content = stringifyYaml(data, { indent: 2 });
    await fs.writeFile(filePath, content, 'utf-8');
  } catch (error) {
    logger.error({ error, filePath }, 'Failed to write YAML file');
    throw new FileSystemError(`Failed to write YAML file: ${filePath}`);
  }
}

export async function readJson<T>(filePath: string): Promise<T> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error) {
    logger.error({ error, filePath }, 'Failed to read JSON file');
    throw new FileSystemError(`Failed to read JSON file: ${filePath}`);
  }
}

export async function writeJson<T>(filePath: string, data: T): Promise<void> {
  try {
    const content = JSON.stringify(data, null, 2);
    await fs.writeFile(filePath, content, 'utf-8');
  } catch (error) {
    logger.error({ error, filePath }, 'Failed to write JSON file');
    throw new FileSystemError(`Failed to write JSON file: ${filePath}`);
  }
}

export async function copyDirectory(src: string, dest: string): Promise<void> {
  try {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  } catch (error) {
    logger.error({ error, src, dest }, 'Failed to copy directory');
    throw new FileSystemError(`Failed to copy directory from ${src} to ${dest}`);
  }
}

export async function deleteDirectory(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch (error) {
    logger.error({ error, dirPath }, 'Failed to delete directory');
    throw new FileSystemError(`Failed to delete directory: ${dirPath}`);
  }
}

export async function listDirectories(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.filter(e => e.isDirectory()).map(e => e.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    logger.error({ error, dirPath }, 'Failed to list directories');
    throw new FileSystemError(`Failed to list directories in: ${dirPath}`);
  }
}

export async function listFiles(dirPath: string, extension?: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    let files = entries.filter(e => e.isFile()).map(e => e.name);
    if (extension) {
      files = files.filter(f => f.endsWith(extension));
    }
    return files;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    logger.error({ error, dirPath }, 'Failed to list files');
    throw new FileSystemError(`Failed to list files in: ${dirPath}`);
  }
}

export async function getDirectorySize(dirPath: string): Promise<number> {
  let totalSize = 0;

  async function calculateSize(currentPath: string): Promise<void> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await calculateSize(fullPath);
      } else {
        const stat = await fs.stat(fullPath);
        totalSize += stat.size;
      }
    }
  }

  try {
    await calculateSize(dirPath);
    return totalSize;
  } catch (error) {
    logger.error({ error, dirPath }, 'Failed to calculate directory size');
    return 0;
  }
}

export const fileManager = {
  initializeDataDirectory,
  pathExists,
  isDirectory,
  readYaml,
  writeYaml,
  readJson,
  writeJson,
  copyDirectory,
  deleteDirectory,
  listDirectories,
  listFiles,
  getDirectorySize
};
