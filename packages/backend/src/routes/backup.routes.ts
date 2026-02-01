import type { FastifyInstance } from 'fastify';
import { CreateBackupRequestSchema } from '@garcon/shared';
import { backupService } from '../services/backup.service.js';

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
}
