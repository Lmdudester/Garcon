import type { FastifyInstance } from 'fastify';
import { CreateWebAppRequestSchema, UpdateWebAppRequestSchema } from '@garcon/shared';
import { webAppService } from '../services/web-app.service.js';

export async function webAppRoutes(app: FastifyInstance) {
  app.get('/web-apps', async () => {
    return webAppService.listWebApps();
  });

  app.get('/web-apps/containers', async () => {
    return webAppService.listAvailableContainers();
  });

  app.post('/web-apps', async (request, reply) => {
    const body = CreateWebAppRequestSchema.parse(request.body);
    const webApp = await webAppService.createWebApp(body);
    return reply.status(201).send(webApp);
  });

  app.patch<{ Params: { id: string } }>('/web-apps/:id', async (request) => {
    const body = UpdateWebAppRequestSchema.parse(request.body);
    return webAppService.updateWebApp(request.params.id, body);
  });

  app.delete<{ Params: { id: string } }>('/web-apps/:id', async (request, reply) => {
    await webAppService.deleteWebApp(request.params.id);
    return reply.status(204).send();
  });
}
