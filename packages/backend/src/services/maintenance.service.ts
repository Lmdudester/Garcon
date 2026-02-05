import cron from 'node-cron';
import { createChildLogger } from '../utils/logger.js';
import { serverService } from './server.service.js';
import { backupService } from './backup.service.js';
import { templateService } from './template.service.js';
import { dockerManager } from './docker-manager.service.js';

const logger = createChildLogger('maintenance-service');

class MaintenanceService {
  private scheduledTask: cron.ScheduledTask | null = null;
  private rescheduleTask: cron.ScheduledTask | null = null;

  /**
   * Determines if the current date is in US Eastern Daylight Time (EDT).
   * EDT is observed from the second Sunday of March to the first Sunday of November.
   */
  private isEasternDaylightTime(): boolean {
    const now = new Date();
    const year = now.getUTCFullYear();

    // Second Sunday of March at 2 AM local -> 7 AM UTC (EST)
    const marchSecondSunday = this.getNthSundayOfMonth(year, 2, 2);
    marchSecondSunday.setUTCHours(7, 0, 0, 0);

    // First Sunday of November at 2 AM local -> 6 AM UTC (EDT)
    const novemberFirstSunday = this.getNthSundayOfMonth(year, 10, 1);
    novemberFirstSunday.setUTCHours(6, 0, 0, 0);

    return now >= marchSecondSunday && now < novemberFirstSunday;
  }

  /**
   * Gets the nth Sunday of a given month.
   */
  private getNthSundayOfMonth(year: number, month: number, n: number): Date {
    const date = new Date(Date.UTC(year, month, 1));
    let sundayCount = 0;

    while (sundayCount < n) {
      if (date.getUTCDay() === 0) {
        sundayCount++;
        if (sundayCount === n) break;
      }
      date.setUTCDate(date.getUTCDate() + 1);
    }

    return date;
  }

  /**
   * Gets the UTC hour for 4 AM Eastern Time.
   * - EST (Winter): UTC-5, so 4 AM EST = 9 AM UTC
   * - EDT (Summer): UTC-4, so 4 AM EDT = 8 AM UTC
   */
  private get4AMEasternUTCHour(): number {
    return this.isEasternDaylightTime() ? 8 : 9;
  }

  /**
   * Schedules the maintenance job to run at 4 AM Eastern.
   */
  private scheduleMaintenance(): void {
    if (this.scheduledTask) {
      this.scheduledTask.stop();
    }

    const utcHour = this.get4AMEasternUTCHour();
    const cronExpression = `0 ${utcHour} * * *`;

    logger.info({ utcHour, isDST: this.isEasternDaylightTime() }, 'Scheduling maintenance');

    this.scheduledTask = cron.schedule(cronExpression, () => {
      this.runMaintenance().catch(error => {
        logger.error({ error }, 'Maintenance run failed');
      });
    }, {
      timezone: 'UTC'
    });
  }

  /**
   * Schedules a daily reschedule check at midnight UTC to handle DST transitions.
   */
  private scheduleRescheduleCheck(): void {
    if (this.rescheduleTask) {
      this.rescheduleTask.stop();
    }

    // Run at midnight UTC every day
    this.rescheduleTask = cron.schedule('0 0 * * *', () => {
      logger.info('Checking DST status for maintenance reschedule');
      this.scheduleMaintenance();
    }, {
      timezone: 'UTC'
    });
  }

  /**
   * Initializes the maintenance scheduler.
   */
  initialize(): void {
    this.scheduleMaintenance();
    this.scheduleRescheduleCheck();
    logger.info('Maintenance service initialized');
  }

  /**
   * Stops all scheduled tasks.
   */
  shutdown(): void {
    if (this.scheduledTask) {
      this.scheduledTask.stop();
      this.scheduledTask = null;
    }
    if (this.rescheduleTask) {
      this.rescheduleTask.stop();
      this.rescheduleTask = null;
    }
    logger.info('Maintenance service shut down');
  }

  /**
   * Runs the maintenance routine:
   * 1. Gets all running servers
   * 2. For each: create 'auto' backup, stop server
   * 3. If restartAfterMaintenance: start server again
   */
  async runMaintenance(): Promise<void> {
    logger.info('Starting scheduled maintenance');

    const servers = await serverService.listServers();
    const runningServers = servers.filter(s => s.status === 'running');

    if (runningServers.length === 0) {
      logger.info('No running servers, skipping maintenance');
      return;
    }

    logger.info({ count: runningServers.length }, 'Processing running servers');

    for (const server of runningServers) {
      try {
        logger.info({ serverId: server.id, name: server.name }, 'Processing server for maintenance');

        // Create backup before stopping
        await backupService.createBackup(server.id, 'auto');
        logger.info({ serverId: server.id }, 'Maintenance backup created');

        // Stop the server
        const template = await templateService.getTemplate(server.templateId);
        await dockerManager.stopContainer(server.id, template.execution.stopTimeout);
        logger.info({ serverId: server.id }, 'Server stopped for maintenance');

        // Update server state to stopped
        const state = serverService.getServerState(server.id);
        if (state) {
          state.status = 'stopped';
          state.startedAt = undefined;
        }

        // Restart if configured
        if (server.restartAfterMaintenance) {
          logger.info({ serverId: server.id }, 'Restarting server after maintenance');
          await serverService.startServer(server.id);
          logger.info({ serverId: server.id }, 'Server restarted after maintenance');
        }
      } catch (error) {
        logger.error({ error, serverId: server.id }, 'Failed to process server for maintenance');
      }
    }

    logger.info('Scheduled maintenance completed');
  }

  /**
   * Manually trigger maintenance (for testing).
   */
  async triggerMaintenance(): Promise<void> {
    logger.info('Manual maintenance triggered');
    await this.runMaintenance();
  }
}

export const maintenanceService = new MaintenanceService();
