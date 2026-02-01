import path from 'path';
import crypto from 'crypto';
import type {
  ServerConfig,
  Server,
  ServerResponse,
  CreateServerRequest,
  ServerStatus,
  UpdateStage
} from '@garcon/shared';
import { config } from '../config/index.js';
import { createChildLogger } from '../utils/logger.js';
import {
  NotFoundError,
  ValidationError,
  ServerStateError,
  ConflictError
} from '../utils/errors.js';
import {
  pathExists,
  isDirectory,
  copyDirectory,
  deleteDirectory,
  readYaml,
  writeYaml,
  listDirectories
} from './file-manager.service.js';
import { dockerManager } from './docker-manager.service.js';
import { templateService } from './template.service.js';
import { backupService } from './backup.service.js';
import { websocketService } from './websocket.service.js';

const logger = createChildLogger('server-service');

const GARCON_CONFIG_FILE = '.garcon.yaml';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

function generateShortId(): string {
  return crypto.randomBytes(5).toString('hex');
}

function generateServerId(name: string): string {
  const slug = slugify(name);
  const shortId = generateShortId();
  return `${slug}-${shortId}`;
}

interface ServerState {
  config: ServerConfig;
  status: ServerStatus;
  startedAt?: string;
  updateStage: UpdateStage;
  updateBackupTimestamp?: string;
}

class ServerService {
  private servers: Map<string, ServerState> = new Map();

  async initialize(): Promise<void> {
    await this.loadServers();

    // Register for container exit events
    dockerManager.onContainerExit((serverId, exitCode) => {
      this.handleContainerExit(serverId, exitCode);
    });

    // Start monitoring Docker events
    await dockerManager.startEventMonitoring();
  }

  private handleContainerExit(serverId: string, exitCode?: number): void {
    const state = this.servers.get(serverId);
    if (!state) return;

    // Only update if we thought the server was running
    if (state.status === 'running' || state.status === 'starting') {
      logger.info({ serverId, exitCode }, 'Server stopped unexpectedly');
      // Set status to 'error' to indicate unexpected crash - container kept for debugging
      state.status = 'error';
      state.startedAt = undefined;
      websocketService.broadcastServerStatus(serverId, 'error');
    }
  }

  private async loadServers(): Promise<void> {
    const serverDirs = await listDirectories(config.paths.serversDir);

    for (const serverId of serverDirs) {
      try {
        const serverPath = path.join(config.paths.serversDir, serverId);
        const configPath = path.join(serverPath, GARCON_CONFIG_FILE);

        if (await pathExists(configPath)) {
          const serverConfig = await readYaml<ServerConfig>(configPath);
          const containerStatus = await dockerManager.getContainerStatus(serverId);

          let status: ServerStatus = 'stopped';
          let startedAt: string | undefined;
          const updateStage = serverConfig.updateStage || 'none';

          if (containerStatus.running) {
            status = 'running';
            startedAt = new Date().toISOString();
          } else if (updateStage !== 'none') {
            // Server has an update in progress
            status = 'updating';
          }

          this.servers.set(serverId, {
            config: serverConfig,
            status,
            startedAt,
            updateStage
          });

          logger.debug({ serverId }, 'Loaded server');
        }
      } catch (error) {
        logger.error({ error, serverId }, 'Failed to load server');
      }
    }

    logger.info({ count: this.servers.size }, 'Servers loaded');
  }

  async listServers(): Promise<ServerResponse[]> {
    const responses: ServerResponse[] = [];

    for (const [id, state] of this.servers) {
      const template = templateService.getTemplateSync(state.config.templateId);
      responses.push(this.toResponse(id, state, template?.name));
    }

    return responses;
  }

  async getServer(id: string): Promise<ServerResponse> {
    const state = this.servers.get(id);
    if (!state) {
      throw new NotFoundError('Server', id);
    }

    const template = templateService.getTemplateSync(state.config.templateId);
    return this.toResponse(id, state, template?.name);
  }

  async importServer(request: CreateServerRequest): Promise<ServerResponse> {
    if (!(await pathExists(request.sourcePath))) {
      throw new ValidationError(`Source path does not exist: ${request.sourcePath}`);
    }

    if (!(await isDirectory(request.sourcePath))) {
      throw new ValidationError(`Source path is not a directory: ${request.sourcePath}`);
    }

    const template = await templateService.getTemplate(request.templateId);

    if (template.requiredFiles) {
      for (const requiredFile of template.requiredFiles) {
        const filePath = path.join(request.sourcePath, requiredFile);
        if (!(await pathExists(filePath))) {
          throw new ValidationError(
            `Required file '${requiredFile}' not found in source folder`
          );
        }
      }
    }

    const serverId = generateServerId(request.name);
    const serverPath = path.join(config.paths.serversDir, serverId);

    await copyDirectory(request.sourcePath, serverPath);
    logger.info({ serverId, sourcePath: request.sourcePath }, 'Server files copied');

    const defaultPorts = template.defaultPorts?.map((p, index) => ({
      host: p.container + index,
      container: p.container,
      protocol: p.protocol
    })) || [];

    // Build environment with template defaults, then override with request values
    const defaultEnvironment: Record<string, string> = {};
    if (template.variables) {
      for (const variable of template.variables) {
        if (variable.defaultValue !== undefined) {
          defaultEnvironment[variable.name] = variable.defaultValue;
        }
      }
    }

    const serverConfig: ServerConfig = {
      id: serverId,
      name: request.name,
      templateId: request.templateId,
      sourcePath: request.sourcePath,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ports: request.ports || defaultPorts,
      environment: { ...defaultEnvironment, ...request.environment },
      memory: request.memory,
      cpuLimit: request.cpuLimit
    };

    const configPath = path.join(serverPath, GARCON_CONFIG_FILE);
    await writeYaml(configPath, serverConfig);

    const state: ServerState = {
      config: serverConfig,
      status: 'stopped',
      updateStage: 'none'
    };

    this.servers.set(serverId, state);

    websocketService.broadcastServerUpdate(serverId, 'created');

    logger.info({ serverId, name: request.name }, 'Server imported');

    return this.toResponse(serverId, state, template.name);
  }

  async deleteServer(id: string): Promise<void> {
    const state = this.servers.get(id);
    if (!state) {
      throw new NotFoundError('Server', id);
    }

    if (state.status === 'running') {
      throw new ServerStateError('Cannot delete a running server. Stop it first.');
    }

    await dockerManager.removeContainer(id);

    const serverPath = path.join(config.paths.serversDir, id);
    await deleteDirectory(serverPath);

    this.servers.delete(id);

    websocketService.broadcastServerUpdate(id, 'deleted');

    logger.info({ serverId: id }, 'Server deleted');
  }

  async startServer(id: string): Promise<ServerResponse> {
    const state = this.servers.get(id);
    if (!state) {
      throw new NotFoundError('Server', id);
    }

    if (state.status === 'running') {
      throw new ServerStateError('Server is already running');
    }

    if (state.updateStage !== 'none') {
      throw new ServerStateError('Cannot start server while update is in progress');
    }

    this.updateStatus(id, 'starting');

    try {
      const template = await templateService.getTemplate(state.config.templateId);
      const serverPath = path.join(config.paths.serversDir, id);

      await dockerManager.createContainer(state.config, template, serverPath);
      await dockerManager.startContainer(id);

      const startedAt = new Date().toISOString();
      state.status = 'running';
      state.startedAt = startedAt;

      websocketService.broadcastServerStatus(id, 'running', startedAt);

      logger.info({ serverId: id }, 'Server started');

      return this.toResponse(id, state, template.name);
    } catch (error) {
      this.updateStatus(id, 'error');
      throw error;
    }
  }

  async stopServer(id: string): Promise<ServerResponse> {
    const state = this.servers.get(id);
    if (!state) {
      throw new NotFoundError('Server', id);
    }

    if (state.status !== 'running') {
      throw new ServerStateError('Server is not running');
    }

    this.updateStatus(id, 'stopping');

    try {
      const template = await templateService.getTemplate(state.config.templateId);

      if (config.backup.autoBackupOnStop) {
        await backupService.createBackup(id, 'auto');
      }

      await dockerManager.stopContainer(id, template.execution.stopTimeout);

      state.status = 'stopped';
      state.startedAt = undefined;

      websocketService.broadcastServerStatus(id, 'stopped');

      logger.info({ serverId: id }, 'Server stopped');

      return this.toResponse(id, state, template.name);
    } catch (error) {
      this.updateStatus(id, 'error');
      throw error;
    }
  }

  async restartServer(id: string): Promise<ServerResponse> {
    await this.stopServer(id);
    return this.startServer(id);
  }

  async initiateUpdate(id: string): Promise<{ sourcePath: string; backupTimestamp: string; backupPath: string }> {
    const state = this.servers.get(id);
    if (!state) {
      throw new NotFoundError('Server', id);
    }

    if (state.updateStage !== 'none') {
      throw new ConflictError('Update already in progress');
    }

    if (state.status === 'running') {
      await this.stopServer(id);
    }

    const backup = await backupService.createBackup(id, 'pre-update');

    await this.saveUpdateStage(id, 'initiated');
    state.updateBackupTimestamp = backup.timestamp;
    this.updateStatus(id, 'updating');

    websocketService.broadcastServerStatus(id, 'updating', undefined, 'initiated');

    logger.info({ serverId: id, backupTimestamp: backup.timestamp }, 'Update initiated');

    return {
      sourcePath: state.config.sourcePath,
      backupTimestamp: backup.timestamp,
      backupPath: backup.filePath
    };
  }

  async applyUpdate(id: string): Promise<ServerResponse> {
    const state = this.servers.get(id);
    if (!state) {
      throw new NotFoundError('Server', id);
    }

    if (state.updateStage !== 'initiated') {
      throw new ServerStateError('No update in progress or update not ready to apply');
    }

    await this.saveUpdateStage(id, 'applying');
    websocketService.broadcastServerStatus(id, 'updating', undefined, 'applying');

    try {
      const serverPath = path.join(config.paths.serversDir, id);
      await copyDirectory(state.config.sourcePath, serverPath);

      state.config.updatedAt = new Date().toISOString();
      await this.saveUpdateStage(id, 'none');
      state.updateBackupTimestamp = undefined;
      state.status = 'stopped';

      websocketService.broadcastServerStatus(id, 'stopped', undefined, 'none');
      websocketService.broadcastServerUpdate(id, 'updated');

      logger.info({ serverId: id }, 'Update applied');

      const template = templateService.getTemplateSync(state.config.templateId);
      return this.toResponse(id, state, template?.name);
    } catch (error) {
      await this.saveUpdateStage(id, 'initiated');
      this.updateStatus(id, 'error');
      throw error;
    }
  }

  async cancelUpdate(id: string): Promise<ServerResponse> {
    const state = this.servers.get(id);
    if (!state) {
      throw new NotFoundError('Server', id);
    }

    if (state.updateStage === 'none') {
      throw new ServerStateError('No update in progress');
    }

    await this.saveUpdateStage(id, 'none');
    state.updateBackupTimestamp = undefined;
    state.status = 'stopped';

    websocketService.broadcastServerStatus(id, 'stopped', undefined, 'none');

    logger.info({ serverId: id }, 'Update cancelled');

    const template = templateService.getTemplateSync(state.config.templateId);
    return this.toResponse(id, state, template?.name);
  }

  async acknowledgeCrash(id: string): Promise<ServerResponse> {
    const state = this.servers.get(id);
    if (!state) {
      throw new NotFoundError('Server', id);
    }

    if (state.status !== 'error') {
      throw new ServerStateError('Server is not in crashed state');
    }

    // Remove the crashed container (cleanup for debugging is complete)
    await dockerManager.removeContainer(id);

    state.status = 'stopped';
    state.startedAt = undefined;

    websocketService.broadcastServerStatus(id, 'stopped');

    logger.info({ serverId: id }, 'Crash acknowledged, container removed');

    const template = templateService.getTemplateSync(state.config.templateId);
    return this.toResponse(id, state, template?.name);
  }

  getServerState(id: string): ServerState | undefined {
    return this.servers.get(id);
  }

  private updateStatus(id: string, status: ServerStatus): void {
    const state = this.servers.get(id);
    if (state) {
      state.status = status;
      websocketService.broadcastServerStatus(id, status, state.startedAt, state.updateStage);
    }
  }

  private async saveUpdateStage(id: string, updateStage: UpdateStage): Promise<void> {
    const state = this.servers.get(id);
    if (!state) return;

    state.updateStage = updateStage;
    state.config.updateStage = updateStage;

    const serverPath = path.join(config.paths.serversDir, id);
    const configPath = path.join(serverPath, GARCON_CONFIG_FILE);
    await writeYaml(configPath, state.config);
  }

  private toResponse(
    id: string,
    state: ServerState,
    templateName?: string
  ): ServerResponse {
    const uptime = state.startedAt
      ? Math.floor((Date.now() - new Date(state.startedAt).getTime()) / 1000)
      : undefined;

    return {
      id,
      name: state.config.name,
      templateId: state.config.templateId,
      templateName,
      status: state.status,
      startedAt: state.startedAt,
      uptime,
      ports: state.config.ports,
      updateStage: state.updateStage,
      sourcePath: state.config.sourcePath,
      createdAt: state.config.createdAt,
      updatedAt: state.config.updatedAt
    };
  }
}

export const serverService = new ServerService();
