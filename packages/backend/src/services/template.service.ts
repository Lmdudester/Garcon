import path from 'path';
import type { Template, TemplateResponse } from '@garcon/shared';
import { TemplateSchema } from '@garcon/shared';
import { config } from '../config/index.js';
import { createChildLogger } from '../utils/logger.js';
import { NotFoundError } from '../utils/errors.js';
import { pathExists, readYaml, writeYaml, listFiles } from './file-manager.service.js';

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

class TemplateService {
  private templates: Map<string, Template> = new Map();
  private initialized = false;

  async initializeDefaultTemplates(): Promise<void> {
    if (this.initialized) return;

    for (const template of DEFAULT_TEMPLATES) {
      const templatePath = path.join(config.paths.templatesDir, `${template.id}.yaml`);

      if (!(await pathExists(templatePath))) {
        await writeYaml(templatePath, template);
        logger.info({ templateId: template.id }, 'Created default template');
      }
    }

    await this.loadTemplates();
    this.initialized = true;
  }

  async loadTemplates(): Promise<void> {
    this.templates.clear();
    const files = await listFiles(config.paths.templatesDir, '.yaml');

    for (const file of files) {
      const templatePath = path.join(config.paths.templatesDir, file);
      try {
        const data = await readYaml<unknown>(templatePath);
        const template = TemplateSchema.parse(data);
        this.templates.set(template.id, template);
        logger.debug({ templateId: template.id }, 'Loaded template');
      } catch (error) {
        logger.error({ error, file }, 'Failed to load template');
      }
    }

    logger.info({ count: this.templates.size }, 'Templates loaded');
  }

  async listTemplates(): Promise<TemplateResponse[]> {
    if (!this.initialized) {
      await this.initializeDefaultTemplates();
    }

    return Array.from(this.templates.values()).map(this.toResponse);
  }

  async getTemplate(id: string): Promise<Template> {
    if (!this.initialized) {
      await this.initializeDefaultTemplates();
    }

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
