import type { FastifyInstance } from 'fastify';
import { CreateServerRequestSchema, UpdateServerRequestSchema, ReorderRequestSchema } from '@garcon/shared';
import { serverService } from '../services/server.service.js';

export async function serverRoutes(app: FastifyInstance) {
  app.get('/servers', async () => {
    return serverService.listServers();
  });

  app.post('/servers', async (request, reply) => {
    const body = CreateServerRequestSchema.parse(request.body);
    const server = await serverService.importServer(body);
    return reply.status(201).send(server);
  });

  app.get<{ Params: { id: string } }>('/servers/:id', async (request) => {
    return serverService.getServer(request.params.id);
  });

  app.delete<{ Params: { id: string } }>('/servers/:id', async (request, reply) => {
    await serverService.deleteServer(request.params.id);
    return reply.status(204).send();
  });

  app.patch<{ Params: { id: string } }>('/servers/:id', async (request) => {
    const body = UpdateServerRequestSchema.parse(request.body);
    return serverService.updateServer(request.params.id, body);
  });

  app.post<{ Params: { id: string } }>('/servers/:id/start', async (request) => {
    return serverService.startServer(request.params.id);
  });

  app.post<{ Params: { id: string } }>('/servers/:id/stop', async (request) => {
    return serverService.stopServer(request.params.id);
  });

  app.post<{ Params: { id: string } }>('/servers/:id/restart', async (request) => {
    return serverService.restartServer(request.params.id);
  });

  app.post<{ Params: { id: string } }>('/servers/:id/update/initiate', async (request) => {
    return serverService.initiateUpdate(request.params.id);
  });

  app.post<{ Params: { id: string } }>('/servers/:id/update/apply', async (request) => {
    return serverService.applyUpdate(request.params.id);
  });

  app.post<{ Params: { id: string } }>('/servers/:id/update/cancel', async (request) => {
    return serverService.cancelUpdate(request.params.id);
  });

  app.post<{ Params: { id: string } }>('/servers/:id/acknowledge-crash', async (request) => {
    return serverService.acknowledgeCrash(request.params.id);
  });

  app.put('/servers/order', async (request, reply) => {
    const body = ReorderRequestSchema.parse(request.body);
    await serverService.reorderServers(body.ids);
    return reply.status(204).send();
  });
}
