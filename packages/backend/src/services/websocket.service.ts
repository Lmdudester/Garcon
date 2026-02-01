import type { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import type { WebSocketOutgoingMessage, ServerStatus, UpdateStage } from '@garcon/shared';
import { createChildLogger } from '../utils/logger.js';

const logger = createChildLogger('websocket-service');

interface WebSocketClient {
  id: string;
  socket: WebSocket;
  subscriptions: Set<string>;
  subscribedToAll: boolean;
}

class WebSocketService {
  private clients: Map<string, WebSocketClient> = new Map();

  addClient(socket: WebSocket): string {
    const clientId = uuidv4();
    this.clients.set(clientId, {
      id: clientId,
      socket,
      subscriptions: new Set(),
      subscribedToAll: false
    });
    return clientId;
  }

  removeClient(clientId: string): void {
    this.clients.delete(clientId);
  }

  subscribe(clientId: string, serverId?: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    if (serverId) {
      client.subscriptions.add(serverId);
      logger.debug({ clientId, serverId }, 'Client subscribed to server');
    } else {
      client.subscribedToAll = true;
      logger.debug({ clientId }, 'Client subscribed to all servers');
    }
  }

  unsubscribe(clientId: string, serverId?: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    if (serverId) {
      client.subscriptions.delete(serverId);
      logger.debug({ clientId, serverId }, 'Client unsubscribed from server');
    } else {
      client.subscribedToAll = false;
      client.subscriptions.clear();
      logger.debug({ clientId }, 'Client unsubscribed from all servers');
    }
  }

  broadcastServerStatus(
    serverId: string,
    status: ServerStatus,
    startedAt?: string,
    updateStage?: UpdateStage
  ): void {
    const message: WebSocketOutgoingMessage = {
      type: 'server_status',
      serverId,
      status,
      startedAt,
      updateStage
    };

    this.broadcastToSubscribers(serverId, message);
  }

  broadcastServerUpdate(serverId: string, action: 'created' | 'updated' | 'deleted'): void {
    const message: WebSocketOutgoingMessage = {
      type: 'server_update',
      serverId,
      action
    };

    this.broadcastToSubscribers(serverId, message);
  }

  private broadcastToSubscribers(serverId: string, message: WebSocketOutgoingMessage): void {
    const messageStr = JSON.stringify(message);

    for (const client of this.clients.values()) {
      if (client.subscribedToAll || client.subscriptions.has(serverId)) {
        try {
          client.socket.send(messageStr);
        } catch (error) {
          logger.error({ error, clientId: client.id }, 'Failed to send WebSocket message');
        }
      }
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }
}

export const websocketService = new WebSocketService();
