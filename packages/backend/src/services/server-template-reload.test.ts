import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { config } from '../config/index.js';
import { backupService } from './backup.service.js';
import { dockerProvider } from './docker-execution.provider.js';
import * as files from './file-manager.service.js';
import { nativeProvider } from './native-execution.provider.js';
import { ServerService } from './server.service.js';
import { TemplateService, templateService } from './template.service.js';

vi.mock('./docker-execution.provider.js', () => ({
  dockerProvider: {
    onProcessExit: vi.fn(),
    startEventMonitoring: vi.fn(),
    getProcessStatus: vi.fn(async () => ({ exists: false, running: false })),
    removeProcess: vi.fn(),
    startServer: vi.fn(),
    stopServer: vi.fn()
  }
}));

vi.mock('./native-execution.provider.js', () => ({
  nativeProvider: {
    onProcessExit: vi.fn(),
    startEventMonitoring: vi.fn(),
    getProcessStatus: vi.fn(async () => ({ exists: false, running: false })),
    removeProcess: vi.fn(),
    startServer: vi.fn(),
    stopServer: vi.fn()
  }
}));

vi.mock('./backup.service.js', () => ({
  backupService: { createBackup: vi.fn() }
}));

describe('Template reload and existing servers', () => {
  const previousPaths = { ...config.paths };
  const previousAutoBackup = config.backup.autoBackupOnStop;
  let root: string;
  let templates: TemplateService;
  let servers: ServerService;

  const templateFile = (id = 'test-game') => path.join(config.paths.templatesDir, `${id}.yaml`);
  const writeTemplate = (executionMode = 'native', stopTimeout = 30, id = 'test-game') =>
    files.writeYaml(templateFile(id), {
      id,
      name: 'Test game',
      executionMode,
      execution: { executable: 'example.exe', stopTimeout },
      ...(executionMode === 'docker' && { docker: { baseImage: 'example:test' } })
    });

  async function registerServer(id: string, templateId: string) {
    const directory = path.join(config.paths.serversDir, id);
    await fs.mkdir(directory);
    await files.writeYaml(path.join(directory, '.garcon.yaml'), { id, name: id, templateId });
  }

  async function initialize() {
    await templates.initializeDefaultTemplates();
    await servers.initialize();
    await templates.startRuntimeReloads(() => servers.getReferencedTemplateIds());
    templates.stopWatching();
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'garcon-server-reloads-'));
    Object.assign(config.paths, {
      dataDir: root,
      templatesDir: path.join(root, 'templates'),
      serversDir: path.join(root, 'servers'),
      importDir: path.join(root, 'import')
    });
    await Promise.all([
      fs.mkdir(config.paths.templatesDir),
      fs.mkdir(config.paths.serversDir),
      fs.mkdir(path.join(config.paths.importDir, 'source'), { recursive: true })
    ]);
    templates = new TemplateService(config.paths.templatesDir);
    servers = new ServerService();
    vi.spyOn(templateService, 'getTemplateSync').mockImplementation(id => templates.getTemplateSync(id));
  });

  afterEach(async () => {
    templates.stopWatching();
    vi.restoreAllMocks();
    Object.assign(config.paths, previousPaths);
    config.backup.autoBackupOnStop = previousAutoBackup;
    await fs.rm(root, { recursive: true, force: true });
  });

  it('retains the original provider for stopped and crashed servers after a rejected reload', async () => {
    await writeTemplate('native', 30, 'stopped-game');
    await writeTemplate('native', 30, 'crashed-game');
    await registerServer('stopped', 'stopped-game');
    await registerServer('crashed', 'crashed-game');
    await initialize();
    servers.getServerState('crashed')!.status = 'error';

    for (const id of ['stopped-game', 'crashed-game']) {
      const conflict = { code: 'CONFLICT', details: { changedIds: [id] } };
      await writeTemplate('docker', 30, id);
      await expect(templates.reloadTemplates()).rejects.toMatchObject(conflict);
      await fs.unlink(templateFile(id));
      await expect(templates.reloadTemplates()).rejects.toMatchObject(conflict);
      await writeTemplate('native', 30, id);
    }
    await servers.acknowledgeCrash('crashed');
    await servers.deleteServer('stopped');
    expect(nativeProvider.removeProcess).toHaveBeenNthCalledWith(1, 'crashed');
    expect(nativeProvider.removeProcess).toHaveBeenNthCalledWith(2, 'stopped');
    expect(dockerProvider.removeProcess).not.toHaveBeenCalled();
  });

  it('keeps provider selection and template configuration consistent across a stop-time reload', async () => {
    await writeTemplate();
    await registerServer('running', 'test-game');
    await initialize();
    await servers.startServer('running');

    config.backup.autoBackupOnStop = true;
    const original = templates.getTemplateSync('test-game');
    vi.mocked(backupService.createBackup).mockImplementationOnce(async () => {
      await writeTemplate('native', 90);
      await templates.reloadTemplates();
      return {} as Awaited<ReturnType<typeof backupService.createBackup>>;
    });
    await servers.stopServer('running');

    expect(nativeProvider.startServer).toHaveBeenCalledWith(expect.anything(), original, expect.any(String));
    expect(nativeProvider.stopServer).toHaveBeenCalledWith('running', original, 30);
    expect(dockerProvider.stopServer).not.toHaveBeenCalled();
    expect(templates.getTemplateSync('test-game')?.execution.stopTimeout).toBe(90);
  });

  it('reserves the template during the first filesystem check and releases it if import fails', async () => {
    await writeTemplate();
    await initialize();
    let entered!: () => void;
    let finishCheck!: (exists: boolean) => void;
    const checking = new Promise<void>(resolve => { entered = resolve; });
    vi.spyOn(files, 'pathExists').mockImplementationOnce(() => {
      entered();
      return new Promise(resolve => { finishCheck = resolve; });
    });
    const importing = servers.importServer({ name: 'Pending', sourcePath: 'source', templateId: 'test-game' });
    const settled = expect(importing).rejects.toThrow("Folder 'source' not found");
    await checking;

    expect(servers.getReferencedTemplateIds().has('test-game')).toBe(true);
    await writeTemplate('docker');
    await expect(templates.reloadTemplates()).rejects.toMatchObject({ code: 'CONFLICT' });
    finishCheck(false);
    await settled;

    expect(servers.getReferencedTemplateIds().has('test-game')).toBe(false);
    await templates.reloadTemplates();
    expect(templates.getTemplateSync('test-game')?.executionMode).toBe('docker');
    const imported = await servers.importServer({ name: 'Imported', sourcePath: 'source', templateId: 'test-game' });
    expect(imported.templateId).toBe('test-game');
    expect(servers.getReferencedTemplateIds().has('test-game')).toBe(true);
  });

  it('keeps servers with missing templates visible and refuses lifecycle actions safely', async () => {
    await registerServer('legacy', 'missing');
    await initialize();
    expect(await servers.listServers()).toContainEqual(expect.objectContaining({ id: 'legacy' }));
    expect(nativeProvider.getProcessStatus).not.toHaveBeenCalled();
    expect(dockerProvider.getProcessStatus).not.toHaveBeenCalled();
    for (const action of ['startServer', 'stopServer', 'deleteServer', 'acknowledgeCrash'] as const) {
      await expect(servers[action]('legacy')).rejects.toThrow('Restore its original file and restart Garcon');
    }
    expect(nativeProvider.removeProcess).not.toHaveBeenCalled();
    expect(dockerProvider.removeProcess).not.toHaveBeenCalled();
    await expect(fs.access(path.join(config.paths.serversDir, 'legacy', '.garcon.yaml'))).resolves.toBeUndefined();
  });
});
