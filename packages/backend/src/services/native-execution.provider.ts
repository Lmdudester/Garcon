import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import treeKill from 'tree-kill';
import type { ServerConfig, Template } from '@garcon/shared';
import { config } from '../config/index.js';
import { createChildLogger } from '../utils/logger.js';
import { NativeProcessError } from '../utils/errors.js';
import { sendRconCommand } from '../utils/rcon.js';
import type { ExecutionProvider, ProcessStatus } from './execution-provider.js';

const logger = createChildLogger('native-provider');

interface ManagedProcess {
  serverId: string;
  pid: number;
  processName: string;
  startTime: number;
  child?: ChildProcess;
  pollTimer?: ReturnType<typeof setInterval>;
}

interface PersistedProcess {
  serverId: string;
  pid: number;
  processName: string;
  startTime: number;
}

type ProcessExitCallback = (serverId: string, exitCode?: number) => void;

class NativeExecutionProvider implements ExecutionProvider {
  private managed: Map<string, ManagedProcess> = new Map();
  private exitCallbacks: ProcessExitCallback[] = [];
  private persistPath: string;

  constructor() {
    this.persistPath = path.join(config.paths.dataDir, 'native-processes.json');
  }

  onProcessExit(callback: ProcessExitCallback): () => void {
    this.exitCallbacks.push(callback);
    return () => {
      const index = this.exitCallbacks.indexOf(callback);
      if (index > -1) {
        this.exitCallbacks.splice(index, 1);
      }
    };
  }

  async startEventMonitoring(): Promise<void> {
    // Native provider uses process exit events and polling, no separate event stream needed
    logger.info('Native process monitoring active');
  }

  async checkAvailability(): Promise<boolean> {
    // Native execution is always available on Windows
    return process.platform === 'win32';
  }

  async getProcessStatus(serverId: string): Promise<ProcessStatus> {
    const managed = this.managed.get(serverId);
    if (!managed) {
      return { exists: false, running: false };
    }

    const alive = await this.isProcessAlive(managed.pid);
    return {
      exists: true,
      running: alive,
      processId: String(managed.pid)
    };
  }

  async startServer(
    serverConfig: ServerConfig,
    template: Template,
    serverDataPath: string
  ): Promise<string> {
    const executable = template.execution.executable;
    if (!executable) {
      throw new NativeProcessError('No executable specified in template');
    }

    // Check if already managed
    const existing = this.managed.get(serverConfig.id);
    if (existing) {
      const alive = await this.isProcessAlive(existing.pid);
      if (alive) {
        throw new NativeProcessError('Process is already running', {
          serverId: serverConfig.id,
          pid: existing.pid
        });
      }
      // Clean up stale entry
      this.cleanupManaged(serverConfig.id);
    }

    const executablePath = path.join(serverDataPath, executable);
    const args = template.execution.args || [];

    // Ensure log directory exists
    const logDir = path.join(config.paths.dataDir, 'logs');
    await fs.mkdir(logDir, { recursive: true });

    const logPath = path.join(logDir, `${serverConfig.id}.log`);
    const logStream = await fs.open(logPath, 'a');

    logger.info({
      serverId: serverConfig.id,
      executable: executablePath,
      args,
      cwd: serverDataPath
    }, 'Spawning native process');

    const child = spawn(executablePath, args, {
      cwd: serverDataPath,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    if (!child.pid) {
      logStream.close();
      throw new NativeProcessError('Failed to spawn process - no PID assigned');
    }

    // Pipe stdout/stderr to log file
    const writeStream = logStream.createWriteStream();
    child.stdout?.pipe(writeStream);
    child.stderr?.pipe(writeStream);

    const processName = path.basename(executable);
    const managedProcess: ManagedProcess = {
      serverId: serverConfig.id,
      pid: child.pid,
      processName,
      startTime: Date.now(),
      child
    };

    this.managed.set(serverConfig.id, managedProcess);

    // Listen for process exit
    child.on('exit', (code, signal) => {
      logger.info({
        serverId: serverConfig.id,
        pid: child.pid,
        exitCode: code,
        signal
      }, 'Native process exited');

      writeStream.end();
      logStream.close();
      this.cleanupManaged(serverConfig.id);

      for (const callback of this.exitCallbacks) {
        callback(serverConfig.id, code ?? undefined);
      }
    });

    child.on('error', (err) => {
      logger.error({
        serverId: serverConfig.id,
        error: err
      }, 'Native process error');

      writeStream.end();
      logStream.close();
      this.cleanupManaged(serverConfig.id);

      for (const callback of this.exitCallbacks) {
        callback(serverConfig.id, 1);
      }
    });

    await this.persistProcesses();

    logger.info({
      serverId: serverConfig.id,
      pid: child.pid
    }, 'Native process started');

    return String(child.pid);
  }

  async stopServer(serverId: string, template: Template, timeout?: number): Promise<void> {
    const managed = this.managed.get(serverId);
    if (!managed) {
      logger.info({ serverId }, 'No managed process found, nothing to stop');
      return;
    }

    const alive = await this.isProcessAlive(managed.pid);
    if (!alive) {
      logger.info({ serverId }, 'Process already exited');
      this.cleanupManaged(serverId);
      await this.persistProcesses();
      return;
    }

    const stopTimeout = timeout ?? template.execution.stopTimeout ?? 30;

    // Try RCON graceful shutdown first
    if (template.execution.rcon?.enabled) {
      const rconSuccess = await this.tryRconShutdown(serverId, managed, template, stopTimeout);
      if (rconSuccess) {
        this.cleanupManaged(serverId);
        await this.persistProcesses();
        return;
      }
    }

    // Fallback: tree-kill
    logger.info({ serverId, pid: managed.pid }, 'Using tree-kill to stop process');
    await this.forceKill(managed.pid);
    // Wait for process to fully exit and release resources (ports, file locks)
    await this.waitForExit(managed.pid, 10000);
    this.cleanupManaged(serverId);
    await this.persistProcesses();
  }

  async removeProcess(serverId: string): Promise<void> {
    const managed = this.managed.get(serverId);
    if (!managed) {
      return;
    }

    const alive = await this.isProcessAlive(managed.pid);
    if (alive) {
      await this.forceKill(managed.pid);
      await this.waitForExit(managed.pid, 10000);
    }

    this.cleanupManaged(serverId);
    await this.persistProcesses();
    logger.info({ serverId }, 'Native process removed');
  }

  async reconcile(): Promise<void> {
    let persisted: PersistedProcess[] = [];

    try {
      const data = await fs.readFile(this.persistPath, 'utf8');
      persisted = JSON.parse(data);
    } catch {
      // No persisted processes file, nothing to reconcile
      logger.debug('No native processes to reconcile');
      return;
    }

    let adopted = 0;

    for (const entry of persisted) {
      const alive = await this.isProcessAlive(entry.pid);
      if (!alive) {
        logger.debug({ serverId: entry.serverId, pid: entry.pid }, 'Persisted process no longer alive');
        continue;
      }

      // Verify process name matches (prevent PID reuse confusion)
      const nameMatches = await this.verifyProcessName(entry.pid, entry.processName);
      if (!nameMatches) {
        logger.warn({
          serverId: entry.serverId,
          pid: entry.pid,
          expectedName: entry.processName
        }, 'PID reused by different process, skipping');
        continue;
      }

      // Re-adopt process with polling watcher
      const managedProcess: ManagedProcess = {
        serverId: entry.serverId,
        pid: entry.pid,
        processName: entry.processName,
        startTime: entry.startTime
      };

      this.managed.set(entry.serverId, managedProcess);
      this.startPollingWatcher(entry.serverId, entry.pid);
      adopted++;

      logger.info({
        serverId: entry.serverId,
        pid: entry.pid
      }, 'Re-adopted native process');
    }

    logger.info({ adopted, total: persisted.length }, 'Native process reconciliation complete');
    await this.persistProcesses();
  }

  private async tryRconShutdown(
    serverId: string,
    managed: ManagedProcess,
    template: Template,
    timeoutSec: number
  ): Promise<boolean> {
    const rcon = template.execution.rcon!;
    let rconPort = rcon.port ?? 25575;
    let rconPassword = rcon.password ?? '';

    // Try to read RCON config from ServerHostSettings.json (V Rising specific)
    try {
      const serverDataPath = path.join(config.paths.serversDir, serverId);
      const settingsPath = path.join(serverDataPath, 'save-data', 'Settings', 'ServerHostSettings.json');
      const settingsData = await fs.readFile(settingsPath, 'utf8');
      const settings = JSON.parse(settingsData);

      if (settings.Rcon?.Enabled) {
        rconPort = settings.Rcon.Port ?? rconPort;
        rconPassword = settings.Rcon.Password ?? rconPassword;
      }
    } catch {
      logger.debug({ serverId }, 'Could not read ServerHostSettings.json, using template RCON config');
    }

    const shutdownCommand = rcon.shutdownCommand ?? 'shutdown';

    try {
      logger.info({
        serverId,
        port: rconPort,
        command: shutdownCommand
      }, 'Sending RCON shutdown command');

      await sendRconCommand('127.0.0.1', rconPort, rconPassword, shutdownCommand);

      // Wait for process to exit
      const exited = await this.waitForExit(managed.pid, timeoutSec * 1000);

      if (exited) {
        logger.info({ serverId }, 'Process exited cleanly after RCON shutdown');
        return true;
      } else {
        logger.warn({ serverId }, 'Process did not exit within timeout after RCON shutdown');
        // Fall through to force kill
        await this.forceKill(managed.pid);
        return true;
      }
    } catch (error) {
      logger.warn({
        serverId,
        error: (error as Error).message
      }, 'RCON shutdown failed, falling back to force kill');
      return false;
    }
  }

  private async waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
    const start = Date.now();
    const pollInterval = 1000;

    while (Date.now() - start < timeoutMs) {
      const alive = await this.isProcessAlive(pid);
      if (!alive) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    return false;
  }

  private async isProcessAlive(pid: number): Promise<boolean> {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  private async verifyProcessName(pid: number, expectedName: string): Promise<boolean> {
    try {
      const { exec } = await import('child_process');
      return new Promise((resolve) => {
        exec(
          `tasklist /FI "PID eq ${pid}" /FO CSV /NH`,
          (error, stdout) => {
            if (error || !stdout) {
              resolve(false);
              return;
            }
            // Output format: "processname.exe","PID","Session Name","Session#","Mem Usage"
            const lower = stdout.toLowerCase();
            resolve(lower.includes(expectedName.toLowerCase()));
          }
        );
      });
    } catch {
      return false;
    }
  }

  private startPollingWatcher(serverId: string, pid: number): void {
    const timer = setInterval(async () => {
      const alive = await this.isProcessAlive(pid);
      if (!alive) {
        logger.info({ serverId, pid }, 'Polled process no longer alive');
        clearInterval(timer);

        const managed = this.managed.get(serverId);
        if (managed) {
          managed.pollTimer = undefined;
        }
        this.cleanupManaged(serverId);
        await this.persistProcesses();

        for (const callback of this.exitCallbacks) {
          callback(serverId, undefined);
        }
      }
    }, 10000);

    const managed = this.managed.get(serverId);
    if (managed) {
      managed.pollTimer = timer;
    }
  }

  private cleanupManaged(serverId: string): void {
    const managed = this.managed.get(serverId);
    if (managed?.pollTimer) {
      clearInterval(managed.pollTimer);
    }
    this.managed.delete(serverId);
  }

  private async forceKill(pid: number): Promise<void> {
    return new Promise((resolve, reject) => {
      treeKill(pid, 'SIGKILL', (err) => {
        if (err) {
          // Process may have already exited
          logger.warn({ pid, error: err.message }, 'tree-kill returned error (process may have already exited)');
          resolve();
        } else {
          logger.info({ pid }, 'Process tree killed');
          resolve();
        }
      });
    });
  }

  private async persistProcesses(): Promise<void> {
    const entries: PersistedProcess[] = [];

    for (const managed of this.managed.values()) {
      entries.push({
        serverId: managed.serverId,
        pid: managed.pid,
        processName: managed.processName,
        startTime: managed.startTime
      });
    }

    try {
      await fs.writeFile(this.persistPath, JSON.stringify(entries, null, 2), 'utf8');
    } catch (error) {
      logger.error({ error }, 'Failed to persist native process state');
    }
  }
}

export const nativeProvider = new NativeExecutionProvider();
