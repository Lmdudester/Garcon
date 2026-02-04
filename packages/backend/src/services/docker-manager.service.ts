import Docker from 'dockerode';
import type { Container, ContainerInfo, ContainerCreateOptions } from 'dockerode';
import type { ServerConfig, Template, ServerStatus } from '@garcon/shared';
import { config } from '../config/index.js';
import { createChildLogger } from '../utils/logger.js';
import { DockerError } from '../utils/errors.js';

const logger = createChildLogger('docker-manager');

interface ContainerStatus {
  exists: boolean;
  running: boolean;
  containerId?: string;
  state?: string;
}

type ContainerExitCallback = (serverId: string, exitCode?: number) => void;

class DockerManagerService {
  private docker: Docker;
  private containerCache: Map<string, string> = new Map();
  private exitCallbacks: ContainerExitCallback[] = [];
  private eventStream: NodeJS.ReadableStream | null = null;

  constructor() {
    this.docker = new Docker({
      socketPath: config.docker.socketPath
    });
  }

  onContainerExit(callback: ContainerExitCallback): () => void {
    this.exitCallbacks.push(callback);
    return () => {
      const index = this.exitCallbacks.indexOf(callback);
      if (index > -1) {
        this.exitCallbacks.splice(index, 1);
      }
    };
  }

  async startEventMonitoring(): Promise<void> {
    try {
      this.eventStream = await this.docker.getEvents({
        filters: {
          type: ['container'],
          event: ['die', 'stop'],
          label: ['garcon.managed=true']
        }
      });

      this.eventStream.on('data', (chunk: Buffer) => {
        try {
          const event = JSON.parse(chunk.toString());
          const serverId = event.Actor?.Attributes?.['garcon.serverId'];
          const exitCode = event.Actor?.Attributes?.exitCode
            ? parseInt(event.Actor.Attributes.exitCode, 10)
            : undefined;

          if (serverId) {
            logger.info({ serverId, event: event.Action, exitCode }, 'Container exit detected');
            for (const callback of this.exitCallbacks) {
              callback(serverId, exitCode);
            }
          }
        } catch (err) {
          logger.error({ error: err }, 'Failed to parse Docker event');
        }
      });

      this.eventStream.on('error', (err) => {
        logger.error({ error: err }, 'Docker event stream error');
      });

      logger.info('Docker event monitoring started');
    } catch (error) {
      logger.error({ error }, 'Failed to start Docker event monitoring');
    }
  }

  private getContainerName(serverId: string): string {
    return `${config.docker.containerPrefix}${serverId}`;
  }

  private getLabels(serverId: string): Record<string, string> {
    return {
      'garcon.managed': 'true',
      'garcon.serverId': serverId
    };
  }

  async checkConnection(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch (error) {
      logger.error({ error }, 'Docker connection failed');
      return false;
    }
  }

  async getContainerStatus(serverId: string): Promise<ContainerStatus> {
    const containerName = this.getContainerName(serverId);

    try {
      const containers = await this.docker.listContainers({
        all: true,
        filters: { name: [containerName] }
      });

      if (containers.length === 0) {
        return { exists: false, running: false };
      }

      const containerInfo = containers[0]!;
      return {
        exists: true,
        running: containerInfo.State === 'running',
        containerId: containerInfo.Id,
        state: containerInfo.State
      };
    } catch (error) {
      logger.error({ error, serverId }, 'Failed to get container status');
      throw new DockerError(`Failed to get container status: ${(error as Error).message}`);
    }
  }

  async createContainer(
    serverConfig: ServerConfig,
    template: Template,
    serverDataPath: string
  ): Promise<string> {
    const containerName = this.getContainerName(serverConfig.id);
    const labels = this.getLabels(serverConfig.id);

    const command = this.substituteVariables(
      template.execution.command,
      serverConfig.environment
    );

    const portBindings: Record<string, Array<{ HostPort: string }>> = {};
    const exposedPorts: Record<string, object> = {};

    for (const portMapping of serverConfig.ports) {
      const containerPort = `${portMapping.container}/${portMapping.protocol}`;
      exposedPorts[containerPort] = {};
      portBindings[containerPort] = [{ HostPort: String(portMapping.host) }];
    }

    const createOptions: ContainerCreateOptions = {
      Image: template.docker.baseImage,
      name: containerName,
      Labels: labels,
      User: '1000:1000', // Run as non-root user (required by Unreal Engine games, best practice for all)
      Cmd: ['sh', '-c', command],
      WorkingDir: template.docker.mountPath,
      ExposedPorts: exposedPorts,
      HostConfig: {
        Binds: [`${serverDataPath}:${template.docker.mountPath}`],
        PortBindings: portBindings,
        RestartPolicy: { Name: 'no' }
      },
      Env: [
        `HOME=${template.docker.mountPath}`, // Ensure HOME is set for non-root user
        ...Object.entries(serverConfig.environment).map(
          ([key, value]) => `${key}=${value}`
        )
      ]
    };

    if (serverConfig.memory) {
      const memoryBytes = this.parseMemoryString(serverConfig.memory);
      if (createOptions.HostConfig) {
        createOptions.HostConfig.Memory = memoryBytes;
      }
    }

    if (serverConfig.cpuLimit) {
      if (createOptions.HostConfig) {
        createOptions.HostConfig.NanoCpus = serverConfig.cpuLimit * 1e9;
      }
    }

    try {
      const existingStatus = await this.getContainerStatus(serverConfig.id);
      if (existingStatus.exists && existingStatus.containerId) {
        const container = this.docker.getContainer(existingStatus.containerId);
        await container.remove({ force: true });
        logger.info({ serverId: serverConfig.id }, 'Removed existing container');
      }

      // Ensure image exists, pull if needed
      await this.ensureImage(template.docker.baseImage);

      const container = await this.docker.createContainer(createOptions);
      logger.info({ serverId: serverConfig.id, containerId: container.id }, 'Container created');

      this.containerCache.set(serverConfig.id, container.id);
      return container.id;
    } catch (error) {
      logger.error({ error, serverId: serverConfig.id }, 'Failed to create container');
      throw new DockerError(`Failed to create container: ${(error as Error).message}`);
    }
  }

  async startContainer(serverId: string): Promise<void> {
    const status = await this.getContainerStatus(serverId);

    if (!status.exists || !status.containerId) {
      throw new DockerError(`Container for server ${serverId} does not exist`);
    }

    if (status.running) {
      logger.info({ serverId }, 'Container already running');
      return;
    }

    try {
      const container = this.docker.getContainer(status.containerId);
      await container.start();
      logger.info({ serverId }, 'Container started');
    } catch (error) {
      logger.error({ error, serverId }, 'Failed to start container');
      throw new DockerError(`Failed to start container: ${(error as Error).message}`);
    }
  }

  async stopContainer(serverId: string, timeout?: number): Promise<void> {
    const status = await this.getContainerStatus(serverId);

    if (!status.exists || !status.containerId) {
      logger.info({ serverId }, 'Container does not exist, nothing to stop');
      return;
    }

    try {
      const container = this.docker.getContainer(status.containerId);

      if (status.running) {
        await container.stop({ t: timeout ?? config.docker.defaultStopTimeout });
        logger.info({ serverId }, 'Container stopped');
      }

      // Always remove the container after stopping - data is persisted outside
      await container.remove({ force: true });
      this.containerCache.delete(serverId);
      logger.info({ serverId }, 'Container removed');
    } catch (error) {
      logger.error({ error, serverId }, 'Failed to stop/remove container');
      throw new DockerError(`Failed to stop container: ${(error as Error).message}`);
    }
  }

  async removeContainer(serverId: string): Promise<void> {
    const status = await this.getContainerStatus(serverId);

    if (!status.exists || !status.containerId) {
      logger.info({ serverId }, 'Container does not exist, nothing to remove');
      return;
    }

    try {
      const container = this.docker.getContainer(status.containerId);
      await container.remove({ force: true });
      this.containerCache.delete(serverId);
      logger.info({ serverId }, 'Container removed');
    } catch (error) {
      logger.error({ error, serverId }, 'Failed to remove container');
      throw new DockerError(`Failed to remove container: ${(error as Error).message}`);
    }
  }

  async reconcileContainers(): Promise<void> {
    try {
      const containers = await this.docker.listContainers({
        all: true,
        filters: { label: ['garcon.managed=true'] }
      });

      for (const containerInfo of containers) {
        const serverId = containerInfo.Labels?.['garcon.serverId'];
        if (serverId) {
          this.containerCache.set(serverId, containerInfo.Id);
          logger.debug({ serverId, containerId: containerInfo.Id }, 'Reconciled container');
        }
      }

      logger.info({ count: containers.length }, 'Container reconciliation complete');
    } catch (error) {
      logger.error({ error }, 'Failed to reconcile containers');
    }
  }

  async listManagedContainers(): Promise<ContainerInfo[]> {
    try {
      return await this.docker.listContainers({
        all: true,
        filters: { label: ['garcon.managed=true'] }
      });
    } catch (error) {
      logger.error({ error }, 'Failed to list managed containers');
      throw new DockerError(`Failed to list containers: ${(error as Error).message}`);
    }
  }

  async ensureImage(imageName: string): Promise<void> {
    try {
      await this.docker.getImage(imageName).inspect();
      logger.debug({ imageName }, 'Image already exists');
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode === 404) {
        logger.info({ imageName }, 'Image not found locally, pulling...');
        await this.pullImage(imageName);
      } else {
        throw error;
      }
    }
  }

  async pullImage(imageName: string): Promise<void> {
    try {
      logger.info({ imageName }, 'Pulling Docker image');
      await new Promise<void>((resolve, reject) => {
        this.docker.pull(imageName, (err: Error | null, stream: NodeJS.ReadableStream) => {
          if (err) {
            reject(err);
            return;
          }
          this.docker.modem.followProgress(stream, (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
      });
      logger.info({ imageName }, 'Docker image pulled');
    } catch (error) {
      logger.error({ error, imageName }, 'Failed to pull Docker image');
      throw new DockerError(`Failed to pull image ${imageName}: ${(error as Error).message}`);
    }
  }

  private substituteVariables(
    command: string,
    variables: Record<string, string>
  ): string {
    let result = command;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return result;
  }

  private parseMemoryString(memory: string): number {
    const match = memory.match(/^(\d+)([KMGT]?)$/i);
    if (!match) {
      return parseInt(memory, 10);
    }

    const value = parseInt(match[1]!, 10);
    const unit = match[2]?.toUpperCase() || '';

    switch (unit) {
      case 'K':
        return value * 1024;
      case 'M':
        return value * 1024 * 1024;
      case 'G':
        return value * 1024 * 1024 * 1024;
      case 'T':
        return value * 1024 * 1024 * 1024 * 1024;
      default:
        return value;
    }
  }

  getServerStatus(serverId: string): ServerStatus {
    const containerId = this.containerCache.get(serverId);
    if (!containerId) {
      return 'stopped';
    }
    return 'running';
  }
}

export const dockerManager = new DockerManagerService();
