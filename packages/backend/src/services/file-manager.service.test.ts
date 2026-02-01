import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  pathExists,
  isDirectory,
  copyDirectory,
  deleteDirectory,
  readYaml,
  writeYaml,
  readJson,
  writeJson,
  listDirectories,
  listFiles
} from './file-manager.service.js';

describe('FileManagerService', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `garcon-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('pathExists', () => {
    it('returns true for existing path', async () => {
      const filePath = path.join(testDir, 'test.txt');
      await fs.writeFile(filePath, 'test');
      expect(await pathExists(filePath)).toBe(true);
    });

    it('returns false for non-existing path', async () => {
      expect(await pathExists(path.join(testDir, 'nonexistent'))).toBe(false);
    });
  });

  describe('isDirectory', () => {
    it('returns true for directories', async () => {
      expect(await isDirectory(testDir)).toBe(true);
    });

    it('returns false for files', async () => {
      const filePath = path.join(testDir, 'test.txt');
      await fs.writeFile(filePath, 'test');
      expect(await isDirectory(filePath)).toBe(false);
    });

    it('returns false for non-existing paths', async () => {
      expect(await isDirectory(path.join(testDir, 'nonexistent'))).toBe(false);
    });
  });

  describe('YAML operations', () => {
    it('writes and reads YAML files', async () => {
      const filePath = path.join(testDir, 'test.yaml');
      const data = { name: 'test', value: 123, nested: { key: 'value' } };

      await writeYaml(filePath, data);
      const read = await readYaml<typeof data>(filePath);

      expect(read).toEqual(data);
    });
  });

  describe('JSON operations', () => {
    it('writes and reads JSON files', async () => {
      const filePath = path.join(testDir, 'test.json');
      const data = { name: 'test', value: 123, nested: { key: 'value' } };

      await writeJson(filePath, data);
      const read = await readJson<typeof data>(filePath);

      expect(read).toEqual(data);
    });
  });

  describe('copyDirectory', () => {
    it('copies directory contents', async () => {
      const srcDir = path.join(testDir, 'src');
      const destDir = path.join(testDir, 'dest');

      await fs.mkdir(srcDir);
      await fs.writeFile(path.join(srcDir, 'file1.txt'), 'content1');
      await fs.mkdir(path.join(srcDir, 'subdir'));
      await fs.writeFile(path.join(srcDir, 'subdir', 'file2.txt'), 'content2');

      await copyDirectory(srcDir, destDir);

      expect(await pathExists(path.join(destDir, 'file1.txt'))).toBe(true);
      expect(await pathExists(path.join(destDir, 'subdir', 'file2.txt'))).toBe(true);
      expect(await fs.readFile(path.join(destDir, 'file1.txt'), 'utf-8')).toBe('content1');
    });
  });

  describe('deleteDirectory', () => {
    it('deletes directory and contents', async () => {
      const dir = path.join(testDir, 'toDelete');
      await fs.mkdir(dir);
      await fs.writeFile(path.join(dir, 'file.txt'), 'content');

      await deleteDirectory(dir);

      expect(await pathExists(dir)).toBe(false);
    });
  });

  describe('listDirectories', () => {
    it('lists only directories', async () => {
      await fs.mkdir(path.join(testDir, 'dir1'));
      await fs.mkdir(path.join(testDir, 'dir2'));
      await fs.writeFile(path.join(testDir, 'file.txt'), 'content');

      const dirs = await listDirectories(testDir);

      expect(dirs).toContain('dir1');
      expect(dirs).toContain('dir2');
      expect(dirs).not.toContain('file.txt');
    });

    it('returns empty array for non-existing directory', async () => {
      const dirs = await listDirectories(path.join(testDir, 'nonexistent'));
      expect(dirs).toEqual([]);
    });
  });

  describe('listFiles', () => {
    it('lists all files', async () => {
      await fs.writeFile(path.join(testDir, 'file1.txt'), 'content');
      await fs.writeFile(path.join(testDir, 'file2.yaml'), 'content');
      await fs.mkdir(path.join(testDir, 'dir'));

      const files = await listFiles(testDir);

      expect(files).toContain('file1.txt');
      expect(files).toContain('file2.yaml');
      expect(files).not.toContain('dir');
    });

    it('filters by extension', async () => {
      await fs.writeFile(path.join(testDir, 'file1.txt'), 'content');
      await fs.writeFile(path.join(testDir, 'file2.yaml'), 'content');

      const files = await listFiles(testDir, '.yaml');

      expect(files).toEqual(['file2.yaml']);
    });
  });
});
