import { z } from 'zod';

export const ServerStatusSchema = z.enum([
  'stopped',
  'starting',
  'running',
  'stopping',
  'error',
  'updating'
]);

export type ServerStatus = z.infer<typeof ServerStatusSchema>;

export const UpdateStageSchema = z.enum([
  'none',
  'initiated',
  'ready_to_apply',
  'applying'
]);

export type UpdateStage = z.infer<typeof UpdateStageSchema>;

export const ServerConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  templateId: z.string(),
  sourcePath: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  ports: z.array(z.object({
    host: z.number().int().min(1).max(65535),
    container: z.number().int().min(1).max(65535),
    protocol: z.enum(['tcp', 'udp']).default('tcp')
  })).default([]),
  environment: z.record(z.string()).default({}),
  memory: z.string().optional(),
  cpuLimit: z.number().optional(),
  updateStage: UpdateStageSchema.default('none')
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

export const ServerSchema = z.object({
  config: ServerConfigSchema,
  status: ServerStatusSchema,
  containerId: z.string().optional(),
  startedAt: z.string().datetime().optional(),
  updateStage: UpdateStageSchema.default('none'),
  updateBackupTimestamp: z.string().optional()
});

export type Server = z.infer<typeof ServerSchema>;

export const CreateServerRequestSchema = z.object({
  name: z.string().min(1).max(100),
  sourcePath: z.string().min(1),
  templateId: z.string().min(1),
  ports: z.array(z.object({
    host: z.number().int().min(1).max(65535),
    container: z.number().int().min(1).max(65535),
    protocol: z.enum(['tcp', 'udp']).default('tcp')
  })).optional(),
  environment: z.record(z.string()).optional(),
  memory: z.string().optional(),
  cpuLimit: z.number().optional()
});

export type CreateServerRequest = z.infer<typeof CreateServerRequestSchema>;

export const ServerResponseSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  templateId: z.string(),
  templateName: z.string().optional(),
  status: ServerStatusSchema,
  startedAt: z.string().datetime().optional(),
  uptime: z.number().optional(),
  ports: z.array(z.object({
    host: z.number(),
    container: z.number(),
    protocol: z.enum(['tcp', 'udp'])
  })),
  updateStage: UpdateStageSchema,
  sourcePath: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type ServerResponse = z.infer<typeof ServerResponseSchema>;

export const UpdateServerRequestSchema = z.object({
  name: z.string().min(1).max(100).optional(),
});

export type UpdateServerRequest = z.infer<typeof UpdateServerRequestSchema>;
