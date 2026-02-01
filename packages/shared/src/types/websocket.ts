import { z } from 'zod';
import { ServerStatusSchema, UpdateStageSchema } from './server.js';

export const WebSocketMessageTypeSchema = z.enum([
  'subscribe',
  'unsubscribe',
  'server_status',
  'server_update',
  'error',
  'ping',
  'pong'
]);

export type WebSocketMessageType = z.infer<typeof WebSocketMessageTypeSchema>;

export const WebSocketSubscribeMessageSchema = z.object({
  type: z.literal('subscribe'),
  serverId: z.string().min(1).optional()
});

export type WebSocketSubscribeMessage = z.infer<typeof WebSocketSubscribeMessageSchema>;

export const WebSocketUnsubscribeMessageSchema = z.object({
  type: z.literal('unsubscribe'),
  serverId: z.string().min(1).optional()
});

export type WebSocketUnsubscribeMessage = z.infer<typeof WebSocketUnsubscribeMessageSchema>;

export const WebSocketServerStatusMessageSchema = z.object({
  type: z.literal('server_status'),
  serverId: z.string().min(1),
  status: ServerStatusSchema,
  startedAt: z.string().datetime().optional(),
  updateStage: UpdateStageSchema.optional()
});

export type WebSocketServerStatusMessage = z.infer<typeof WebSocketServerStatusMessageSchema>;

export const WebSocketServerUpdateMessageSchema = z.object({
  type: z.literal('server_update'),
  serverId: z.string().min(1),
  action: z.enum(['created', 'updated', 'deleted'])
});

export type WebSocketServerUpdateMessage = z.infer<typeof WebSocketServerUpdateMessageSchema>;

export const WebSocketErrorMessageSchema = z.object({
  type: z.literal('error'),
  message: z.string(),
  code: z.string().optional()
});

export type WebSocketErrorMessage = z.infer<typeof WebSocketErrorMessageSchema>;

export const WebSocketPingMessageSchema = z.object({
  type: z.literal('ping')
});

export type WebSocketPingMessage = z.infer<typeof WebSocketPingMessageSchema>;

export const WebSocketPongMessageSchema = z.object({
  type: z.literal('pong')
});

export type WebSocketPongMessage = z.infer<typeof WebSocketPongMessageSchema>;

export const WebSocketIncomingMessageSchema = z.discriminatedUnion('type', [
  WebSocketSubscribeMessageSchema,
  WebSocketUnsubscribeMessageSchema,
  WebSocketPingMessageSchema
]);

export type WebSocketIncomingMessage = z.infer<typeof WebSocketIncomingMessageSchema>;

export const WebSocketOutgoingMessageSchema = z.discriminatedUnion('type', [
  WebSocketServerStatusMessageSchema,
  WebSocketServerUpdateMessageSchema,
  WebSocketErrorMessageSchema,
  WebSocketPongMessageSchema
]);

export type WebSocketOutgoingMessage = z.infer<typeof WebSocketOutgoingMessageSchema>;
