import type { ServerConfig, Template } from '@garcon/shared';

export interface ProcessStatus {
  exists: boolean;
  running: boolean;
  processId?: string;
}

export interface ExecutionProvider {
  onProcessExit(cb: (serverId: string, exitCode?: number) => void): () => void;
  startEventMonitoring(): Promise<void>;
  getProcessStatus(serverId: string): Promise<ProcessStatus>;
  startServer(config: ServerConfig, template: Template, serverDataPath: string): Promise<string>;
  stopServer(serverId: string, template: Template, timeout?: number): Promise<void>;
  removeProcess(serverId: string): Promise<void>;
  reconcile(): Promise<void>;
  checkAvailability(): Promise<boolean>;
}
