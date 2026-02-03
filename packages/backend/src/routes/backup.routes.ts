import type { FastifyInstance } from 'fastify';
import { CreateBackupRequestSchema } from '@garcon/shared';
import { backupService } from '../services/backup.service.js';
import { serverService } from '../services/server.service.js';
import { ServerStateError } from '../utils/errors.js';

export async function backupRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/servers/:id/backups', async (request) => {
    return backupService.listBackups(request.params.id);
  });

  app.post<{ Params: { id: string } }>('/servers/:id/backups', async (request, reply) => {
    const body = CreateBackupRequestSchema.parse(request.body || {});
    const backup = await backupService.createBackup(request.params.id, 'manual', body.description);
    return reply.status(201).send(backup);
  });

  app.delete<{ Params: { id: string; timestamp: string } }>(
    '/servers/:id/backups/:timestamp',
    async (request, reply) => {
      await backupService.deleteBackup(request.params.id, request.params.timestamp);
      return reply.status(204).send();
    }
  );

  app.post<{ Params: { id: string; timestamp: string } }>(
    '/servers/:id/backups/:timestamp/restore',
    async (request) => {
      const { id, timestamp } = request.params;

      // Check server state
      const state = serverService.getServerState(id);
      if (!state) {
        throw new ServerStateError('Server not found');
      }

      if (state.status === 'running' || state.status === 'starting') {
        throw new ServerStateError('Cannot restore backup while server is running. Stop the server first.');
      }

      if (state.updateStage !== 'none') {
        throw new ServerStateError('Cannot restore backup while update is in progress.');
      }

      return backupService.restoreBackup(id, timestamp);
    }
  );
}
