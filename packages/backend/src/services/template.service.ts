import { watch, type FSWatcher } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'path';
import type { Template, TemplateResponse } from '@garcon/shared';
import { TemplateSchema } from '@garcon/shared';
import { parseDocument } from 'yaml';
import { config } from '../config/index.js';
import { createChildLogger } from '../utils/logger.js';
import { AppError, ConflictError, FileSystemError, NotFoundError, ValidationError } from '../utils/errors.js';
import { pathExists, writeYaml } from './file-manager.service.js';

const logger = createChildLogger('template-service');

const DEFAULT_TEMPLATES: Template[] = [
  {
    id: 'minecraft',
    name: 'Minecraft Java Edition',
    description: 'Minecraft Java Edition server using Eclipse Temurin 21',
    executionMode: 'docker',
    docker: {
      baseImage: 'eclipse-temurin:21-jre',
      mountPath: '/server'
    },
    execution: {
      executable: 'server.jar',
      command: 'java -Xmx2G -Xms2G -jar server.jar nogui',
      stopTimeout: 30,
      requiresNonRoot: false
    },
    defaultPorts: [
      { container: 25565, protocol: 'tcp', description: 'Minecraft server port' }
    ],
    requiredFiles: ['server.jar']
  },
  {
    id: 'valheim',
    name: 'Valheim Dedicated Server',
    description: 'Valheim dedicated server for Linux',
    executionMode: 'docker',
    docker: {
      baseImage: 'ubuntu:22.04',
      mountPath: '/server'
    },
    execution: {
      executable: 'valheim_server.x86_64',
      command: './valheim_server.x86_64 -nographics -batchmode -port 2456 -name "My Valheim Server" -world "Dedicated"',
      stopTimeout: 30,
      requiresNonRoot: false
    },
    defaultPorts: [
      { container: 2456, protocol: 'udp', description: 'Game port' },
      { container: 2457, protocol: 'udp', description: 'Query port' }
    ],
    requiredFiles: ['valheim_server.x86_64']
  },
  {
    id: 'vrising',
    name: 'V Rising Dedicated Server',
    description: 'V Rising dedicated server powered by sknnr (Wine + SteamCMD)',
    executionMode: 'docker',
    docker: {
      baseImage: 'sknnr/vrising-dedicated-server',
      mountPath: '/opt/steam/vrising',
      environment: {
        TZ: 'America/New_York',
        SERVER_NAME: 'V Rising Server',
        SAVE_NAME: 'world1',
        GAME_PORT: '9876',
        QUERY_PORT: '9877'
      }
    },
    execution: {
      stopTimeout: 120,
      requiresNonRoot: false
    },
    defaultPorts: [
      { container: 9876, protocol: 'udp', description: 'Game port', userFacing: true },
      { container: 9877, protocol: 'udp', description: 'Query port' }
    ]
  },
  {
    id: 'vrising-native',
    name: 'V Rising (Native Windows)',
    description: 'V Rising dedicated server running natively on Windows',
    executionMode: 'native',
    execution: {
      executable: 'VRisingServer.exe',
      args: [
        '-persistentDataPath', './save-data',
        '-logFile', './logs/VRisingServer.log',
      ],
      stopTimeout: 120,
      requiresNonRoot: false,
      rcon: {
        enabled: true,
        port: 25575,
        password: '',
        shutdownCommand: 'shutdown 1 "Server shutting down"',
      }
    },
    defaultPorts: [
      { container: 9876, protocol: 'udp', description: 'Game port', userFacing: true },
      { container: 9877, protocol: 'udp', description: 'Query port' },
    ],
    requiredFiles: ['VRisingServer.exe']
  }
];

export class TemplateService {
  private templates: Map<string, Template> = new Map();
  private initialization?: Promise<void>;
  private getProtectedTemplateIds: () => ReadonlySet<string> = () => new Set();
  private reloadQueue: Promise<unknown> = Promise.resolve();
  private watcher?: FSWatcher;
  private watchTimer?: NodeJS.Timeout;

  constructor(private readonly templatesDir = config.paths.templatesDir) {}

  initializeDefaultTemplates(): Promise<void> {
    return this.initialization ??= this.initialize().catch(error => {
      this.initialization = undefined;
      throw error;
    });
  }

  private async initialize(): Promise<void> {
    for (const template of DEFAULT_TEMPLATES) {
      const templatePath = path.join(this.templatesDir, `${template.id}.yaml`);

      if (!(await pathExists(templatePath))) {
        await writeYaml(templatePath, template);
        logger.info({ templateId: template.id }, 'Created default template');
      }
    }

    this.templates = await this.scanTemplates(false);
    logger.info({ count: this.templates.size }, 'Templates loaded');
  }

  startRuntimeReloads(getProtectedTemplateIds: () => ReadonlySet<string>): Promise<{ count: number }> {
    this.getProtectedTemplateIds = getProtectedTemplateIds;
    this.startWatching();
    return this.reloadTemplates('startup catch-up');
  }

  reloadTemplates(trigger = 'API'): Promise<{ count: number }> {
    const reload = this.reloadQueue.then(async () => {
      try {
        await this.initializeDefaultTemplates();
        const candidate = await this.scanTemplates(true);
        this.checkProtectedTemplates(candidate);
        this.templates = candidate;
        const count = candidate.size;
        logger.info({ trigger, count }, 'Templates reloaded');
        return { count };
      } catch (error) {
        logger.warn({
          trigger,
          directory: this.templatesDir,
          code: error instanceof AppError ? error.code : 'INTERNAL_ERROR',
          details: error instanceof AppError ? error.details : undefined
        }, 'Template reload failed');
        throw error;
      }
    });
    this.reloadQueue = reload.catch(() => {});
    return reload;
  }

  private checkProtectedTemplates(candidate: Map<string, Template>): void {
    const changedIds: string[] = [];
    const missingAtStartupIds: string[] = [];
    for (const id of this.getProtectedTemplateIds()) {
      const current = this.templates.get(id);
      const next = candidate.get(id);
      if (current && current.executionMode !== next?.executionMode) {
        changedIds.push(id);
      } else if (!current && next) {
        missingAtStartupIds.push(id);
      }
    }
    if (changedIds.length === 0 && missingAtStartupIds.length === 0) return;

    const instructions = [];
    if (changedIds.length > 0) {
      instructions.push(`Templates in use: ${changedIds.join(', ')}. Restore the original IDs and execution modes, or use a new ID for a different execution mode.`);
    }
    if (missingAtStartupIds.length > 0) {
      instructions.push(`Templates missing at startup: ${missingAtStartupIds.join(', ')}. Restore the original files and restart Garcon to recover those servers.`);
    }
    throw new ConflictError(instructions.join(' '), { changedIds, missingAtStartupIds });
  }

  private async scanTemplates(strict: boolean): Promise<Map<string, Template>> {
    let entries;
    try {
      entries = await readdir(this.templatesDir, { withFileTypes: true });
    } catch {
      throw new FileSystemError('Could not read the templates directory');
    }

    const candidate = new Map<string, Template>();
    const issues: { file: string; reason: string }[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.yaml')) continue;

      let reason = 'Could not read file';
      try {
        const contents = await readFile(path.join(this.templatesDir, entry.name), 'utf8');
        reason = 'Invalid YAML';
        const document = parseDocument(contents, { prettyErrors: false });
        if (document.errors.length > 0) {
          issues.push({ file: entry.name, reason });
          continue;
        }
        if (document.warnings.length > 0) {
          logger.warn({ file: entry.name }, 'Template contains YAML warnings');
        }
        // Silencing the parser itself would also suppress its multiple-document error.
        document.options.logLevel = 'silent';
        const data: unknown = document.toJS();
        reason = 'Template does not match the schema';
        const template = TemplateSchema.parse(data);
        candidate.set(template.id, template);
      } catch {
        issues.push({ file: entry.name, reason });
      }
    }
    if (strict && issues.length > 0) {
      throw new ValidationError('Some template files could not be loaded', { issues });
    }
    for (const issue of issues) {
      logger.error(issue, 'Failed to load template');
    }
    return candidate;
  }

  startWatching(): void {
    if (this.watcher) return;

    let watcher: FSWatcher;
    try {
      watcher = watch(this.templatesDir, { persistent: false });
    } catch {
      logger.warn({ directory: this.templatesDir }, 'Could not watch templates directory');
      return;
    }
    this.watcher = watcher;
    let pending = false;
    let dirty = false;

    const scheduleReload = () => {
      if (this.watcher !== watcher) return;
      if (pending) {
        dirty = true;
        return;
      }

      clearTimeout(this.watchTimer);
      this.watchTimer = setTimeout(() => {
        this.watchTimer = undefined;
        pending = true;
        void this.reloadTemplates('filesystem watcher').catch(() => {}).finally(() => {
          pending = false;
          if (!dirty) return;
          dirty = false;
          scheduleReload();
        });
      }, 250);
      this.watchTimer.unref();
    };

    watcher.on('change', (event, filename) => {
      if (event === 'rename' || !filename || filename.toString().endsWith('.yaml')) {
        scheduleReload();
      }
    });
    watcher.on('error', () => {
      if (this.watcher !== watcher) return;
      logger.warn({ directory: this.templatesDir }, 'Template watcher stopped after an error');
      this.stopWatching();
    });
  }

  stopWatching(): void {
    const watcher = this.watcher;
    this.watcher = undefined;
    clearTimeout(this.watchTimer);
    this.watchTimer = undefined;
    watcher?.close();
  }

  async listTemplates(): Promise<TemplateResponse[]> {
    await this.initializeDefaultTemplates();
    return Array.from(this.templates.values()).map(this.toResponse);
  }

  async getTemplate(id: string): Promise<Template> {
    await this.initializeDefaultTemplates();
    const template = this.templates.get(id);
    if (!template) {
      throw new NotFoundError('Template', id);
    }
    return template;
  }

  getTemplateSync(id: string): Template | undefined {
    return this.templates.get(id);
  }

  private toResponse(template: Template): TemplateResponse {
    return {
      id: template.id,
      name: template.name,
      description: template.description,
      executionMode: template.executionMode,
      defaultPorts: template.defaultPorts
    };
  }
}

export const templateService = new TemplateService();
