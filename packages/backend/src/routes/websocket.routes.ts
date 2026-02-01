import type { FastifyInstance } from 'fastify';
import type { RawData } from 'ws';
import { WebSocketIncomingMessageSchema } from '@garcon/shared';
import { websocketService } from '../services/websocket.service.js';
import { createChildLogger } from '../utils/logger.js';

const logger = createChildLogger('websocket-routes');

export async function websocketRoutes(app: FastifyInstance) {
  app.get('/', { websocket: true }, (socket) => {
    const clientId = websocketService.addClient(socket);
    logger.info({ clientId }, 'WebSocket client connected');

    socket.on('message', (rawMessage: RawData) => {
      try {
        const data = JSON.parse(rawMessage.toString());
        const message = WebSocketIncomingMessageSchema.parse(data);

        switch (message.type) {
          case 'subscribe':
            websocketService.subscribe(clientId, message.serverId);
            break;
          case 'unsubscribe':
            websocketService.unsubscribe(clientId, message.serverId);
            break;
          case 'ping':
            socket.send(JSON.stringify({ type: 'pong' }));
            break;
        }
      } catch (error) {
        logger.warn({ error }, 'Invalid WebSocket message');
        socket.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format'
        }));
      }
    });

    socket.on('close', () => {
      websocketService.removeClient(clientId);
      logger.info({ clientId }, 'WebSocket client disconnected');
    });

    socket.on('error', (error: Error) => {
      logger.error({ clientId, error }, 'WebSocket error');
      websocketService.removeClient(clientId);
    });
  });
}
