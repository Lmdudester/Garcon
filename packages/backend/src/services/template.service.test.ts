import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'node:events';
import { watch, type FSWatcher } from 'node:fs';
import Fastify from 'fastify';
import { TemplateSchema } from '@garcon/shared';
import { TemplateService, templateService } from './template.service.js';
import { templateRoutes } from '../routes/template.routes.js';
import { errorHandler } from '../middleware/error-handler.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, watch: vi.fn(actual.watch) };
});

describe('Template validation', () => {
  it('validates a correct minecraft template', () => {
    const template = {
      id: 'minecraft',
      name: 'Minecraft Java Edition',
      description: 'Minecraft Java Edition server using OpenJDK 17',
      docker: {
        baseImage: 'openjdk:17-slim',
        mountPath: '/server'
      },
      execution: {
        executable: 'server.jar',
        command: 'java -Xmx2G -Xms2G -jar server.jar nogui',
        stopTimeout: 30
      },
      defaultPorts: [
        { container: 25565, protocol: 'tcp', description: 'Minecraft server port' }
      ],
      requiredFiles: ['server.jar']
    };

    const result = TemplateSchema.safeParse(template);
    expect(result.success).toBe(true);
  });

  it('validates a correct valheim template', () => {
    const template = {
      id: 'valheim',
      name: 'Valheim Dedicated Server',
      docker: {
        baseImage: 'ubuntu:22.04',
        mountPath: '/server'
      },
      execution: {
        executable: 'valheim_server.x86_64',
        command: './valheim_server.x86_64 -nographics -batchmode'
      }
    };

    const result = TemplateSchema.safeParse(template);
    expect(result.success).toBe(true);
  });

  it('rejects template without required fields', () => {
    const template = {
      id: 'invalid',
      // missing name
      docker: {
        baseImage: 'ubuntu:22.04'
        // missing mountPath
      },
      execution: {
        // missing executable and command
      }
    };

    const result = TemplateSchema.safeParse(template);
    expect(result.success).toBe(false);
  });

  it('rejects template with invalid port', () => {
    const template = {
      id: 'invalid',
      name: 'Invalid',
      docker: {
        baseImage: 'ubuntu:22.04',
        mountPath: '/server'
      },
      execution: {
        executable: 'server',
        command: './server'
      },
      defaultPorts: [
        { container: 99999, protocol: 'tcp' } // Invalid port number
      ]
    };

    const result = TemplateSchema.safeParse(template);
    expect(result.success).toBe(false);
  });
});

describe('Template reload', () => {
  let root: string;
  let templatesDir: string;
  let service: TemplateService;

  const writeTemplate = (name = 'New game', mode: 'native' | 'docker' = 'native', id = 'new-game') =>
    fs.writeFile(path.join(templatesDir, `${id}.yaml`), JSON.stringify({
      id,
      name,
      executionMode: mode,
      execution: { executable: 'game.exe' },
      ...(mode === 'docker' && { docker: { baseImage: 'example:test' } })
    }));

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'garcon-templates-'));
    templatesDir = path.join(root, 'templates');
    await fs.mkdir(templatesDir);
    service = new TemplateService(templatesDir);
    await service.initializeDefaultTemplates();
  });

  afterEach(async () => {
    service.stopWatching();
    vi.useRealTimers();
    vi.restoreAllMocks();
    await fs.rm(root, { recursive: true, force: true });
  });

  it('publishes valid additions, edits and unused removals without bootstrapping defaults again', async () => {
    const { count } = await service.reloadTemplates();
    await writeTemplate();
    expect(service.getTemplateSync('new-game')).toBeUndefined();
    await expect(service.reloadTemplates()).resolves.toEqual({ count: count + 1 });
    expect(service.getTemplateSync('new-game')?.name).toBe('New game');

    await writeTemplate('Edited game', 'docker');
    await service.reloadTemplates();
    expect(service.getTemplateSync('new-game')).toMatchObject({ name: 'Edited game', executionMode: 'docker' });

    await fs.unlink(path.join(templatesDir, 'new-game.yaml'));
    await fs.unlink(path.join(templatesDir, 'minecraft.yaml'));
    await expect(service.reloadTemplates()).resolves.toEqual({ count: count - 1 });
    expect(service.getTemplateSync('new-game')).toBeUndefined();
    expect(service.getTemplateSync('minecraft')).toBeUndefined();
  });

  it('keeps the active generation and reports sanitized issues on invalid files', async () => {
    await writeTemplate();
    await service.reloadTemplates();
    const active = service.getTemplateSync('new-game');
    await writeTemplate('Unpublished edit');
    await fs.writeFile(path.join(templatesDir, 'bad.yaml'), 'password: [DO_NOT_EXPOSE');
    await fs.writeFile(path.join(templatesDir, 'schema.yaml'), 'id: schema');
    await fs.writeFile(path.join(templatesDir, 'multiple.yaml'), [
      'id: first', 'name: First document', 'executionMode: native', 'execution: {}',
      '---', 'second: [INVALID'
    ].join('\n'));
    await expect(service.reloadTemplates()).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      details: {
        issues: expect.arrayContaining([
          { file: 'bad.yaml', reason: 'Invalid YAML' },
          { file: 'multiple.yaml', reason: 'Invalid YAML' },
          { file: 'schema.yaml', reason: 'Template does not match the schema' }
        ])
      }
    });
    expect(service.getTemplateSync('new-game')).toBe(active);

    await fs.rename(templatesDir, path.join(root, 'hidden'));
    await expect(service.reloadTemplates()).rejects.toMatchObject({ code: 'FILESYSTEM_ERROR' });
    expect(service.getTemplateSync('new-game')).toBe(active);
  });

  it('blocks protected removal, execution-mode changes and reuse of an absent legacy ID', async () => {
    await writeTemplate();
    await service.reloadTemplates();
    await service.startRuntimeReloads(() => new Set(['new-game', 'legacy']));
    service.stopWatching();
    await writeTemplate('Wrong provider', 'docker');
    await expect(service.reloadTemplates()).rejects.toMatchObject({
      code: 'CONFLICT', details: { changedIds: ['new-game'] }
    });
    await fs.unlink(path.join(templatesDir, 'new-game.yaml'));
    await expect(service.reloadTemplates()).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(service.getTemplateSync('new-game')?.executionMode).toBe('native');

    await writeTemplate('Same provider');
    await writeTemplate('Unrelated', 'native', 'unrelated');
    await writeTemplate('Unknown original provider', 'docker', 'legacy');
    await expect(service.reloadTemplates()).rejects.toMatchObject({
      code: 'CONFLICT', details: { missingAtStartupIds: ['legacy'] }
    });
    expect(service.getTemplateSync('unrelated')).toBeUndefined();
    await fs.unlink(path.join(templatesDir, 'legacy.yaml'));
    await service.reloadTemplates();
    expect(service.getTemplateSync('unrelated')?.name).toBe('Unrelated');
    expect(service.getTemplateSync('new-game')?.name).toBe('Same provider');
  });

  it('does not emit raw YAML parser or conversion warnings containing source text', async () => {
    const emitWarning = vi.spyOn(process, 'emitWarning');
    await fs.writeFile(path.join(templatesDir, 'tagged.yaml'), [
      'id: tagged',
      'name: Tagged YAML',
      'docker: { baseImage: example:test }',
      'execution: {}',
      'extension: !unknown DO_NOT_EXPOSE',
      '? [DO_NOT_EXPOSE]',
      ': ignored by the schema'
    ].join('\n'));
    await service.reloadTemplates();
    expect(service.getTemplateSync('tagged')?.id).toBe('tagged');
    expect(emitWarning).not.toHaveBeenCalled();
  });

  it('publishes a later addition through the watcher and the read-only API', async () => {
    vi.spyOn(templateService, 'listTemplates').mockImplementation(() => service.listTemplates());
    const app = Fastify();
    try {
      await app.register(templateRoutes, { prefix: '/api' });
      service.startWatching();
      await writeTemplate();
      await vi.waitFor(async () => {
        const response = await app.inject('/api/templates');
        expect(response.json()).toContainEqual(expect.objectContaining({ id: 'new-game' }));
      }, { timeout: 4000 });
    } finally {
      await app.close();
    }
  });

  it('catches up after startup even if the watcher cannot attach', async () => {
    vi.mocked(watch).mockImplementationOnce(() => {
      throw new Error('Unwatchable');
    });
    await writeTemplate();
    expect(service.getTemplateSync('new-game')).toBeUndefined();
    await service.startRuntimeReloads(() => new Set());
    expect(service.getTemplateSync('new-game')?.name).toBe('New game');
  });

  it('debounces filesystem events and cancels a follow-up on watcher error', async () => {
    vi.useFakeTimers();
    const watcher = Object.assign(new EventEmitter(), { close: vi.fn() });
    vi.mocked(watch).mockImplementationOnce(() => watcher as unknown as FSWatcher);
    let finish!: (result: { count: number }) => void;
    const reload = vi.spyOn(service, 'reloadTemplates').mockImplementationOnce(
      () => new Promise(resolve => { finish = resolve; })
    );
    service.startWatching();
    watcher.emit('change', 'rename', 'new-game.yaml');
    watcher.emit('change', 'change', 'new-game.yaml');
    await vi.advanceTimersByTimeAsync(250);
    expect(reload).toHaveBeenCalledTimes(1);

    watcher.emit('change', 'change', 'new-game.yaml');
    watcher.emit('error', new Error('Unwatchable'));
    finish({ count: 4 });
    await vi.advanceTimersByTimeAsync(500);
    expect(watcher.close).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('loads files through the explicit fallback and returns sanitized API failures', async () => {
    vi.spyOn(templateService, 'reloadTemplates').mockImplementation(() => service.reloadTemplates());
    const app = Fastify();
    app.setErrorHandler(errorHandler);
    try {
      await app.register(templateRoutes, { prefix: '/api' });
      await writeTemplate();
      const reload = () => app.inject({ method: 'POST', url: '/api/templates/reload' });
      const response = await reload();
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ count: (await service.listTemplates()).length });
      expect(service.getTemplateSync('new-game')).toBeDefined();

      await fs.writeFile(path.join(templatesDir, 'bad.yaml'), 'password: [DO_NOT_EXPOSE');
      const invalid = await reload();
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json()).toMatchObject({
        error: 'VALIDATION_ERROR', details: { issues: [{ file: 'bad.yaml', reason: 'Invalid YAML' }] }
      });
      expect(invalid.body).not.toContain('DO_NOT_EXPOSE');

      await fs.unlink(path.join(templatesDir, 'bad.yaml'));
      await service.startRuntimeReloads(() => new Set(['new-game']));
      service.stopWatching();
      await fs.unlink(path.join(templatesDir, 'new-game.yaml'));
      const conflict = await reload();
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json()).toMatchObject({
        error: 'CONFLICT', details: { changedIds: ['new-game'] }
      });
    } finally {
      await app.close();
    }
  });
});
