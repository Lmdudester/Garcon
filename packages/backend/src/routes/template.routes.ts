import type { FastifyInstance } from 'fastify';
import { templateService } from '../services/template.service.js';

export async function templateRoutes(app: FastifyInstance) {
  app.post('/templates/reload', async () => {
    return templateService.reloadTemplates();
  });

  app.get('/templates', async () => {
    return templateService.listTemplates();
  });

  app.get<{ Params: { id: string } }>('/templates/:id', async (request) => {
    return templateService.getTemplate(request.params.id);
  });
}
