import { z } from 'zod';

export const TemplateDockerConfigSchema = z.object({
  baseImage: z.string(),
  mountPath: z.string().default('/server'),
  workDir: z.string().optional(),
  additionalMounts: z.array(z.object({
    host: z.string(),
    container: z.string(),
    readOnly: z.boolean().default(false)
  })).optional(),
  environment: z.record(z.string(), z.string()).optional()
});

export type TemplateDockerConfig = z.infer<typeof TemplateDockerConfigSchema>;

export const TemplateRconConfigSchema = z.object({
  enabled: z.boolean().default(false),
  port: z.number().int().min(1).max(65535).optional(),
  password: z.string().optional(),
  shutdownCommand: z.string().optional()
});

export type TemplateRconConfig = z.infer<typeof TemplateRconConfigSchema>;

export const TemplateExecutionConfigSchema = z.object({
  executable: z.string().optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  stopCommand: z.string().optional(),
  stopTimeout: z.number().default(30),
  requiresNonRoot: z.boolean().default(false),
  rcon: TemplateRconConfigSchema.optional()
});

export type TemplateExecutionConfig = z.infer<typeof TemplateExecutionConfigSchema>;

export const TemplateDefaultPortSchema = z.object({
  container: z.number().int().min(1).max(65535),
  protocol: z.enum(['tcp', 'udp']).default('tcp'),
  description: z.string().optional(),
  userFacing: z.boolean().optional()
});

export type TemplateDefaultPort = z.infer<typeof TemplateDefaultPortSchema>;

export const TemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  executionMode: z.enum(['docker', 'native']).default('docker'),
  docker: TemplateDockerConfigSchema.optional(),
  execution: TemplateExecutionConfigSchema,
  defaultPorts: z.array(TemplateDefaultPortSchema).optional(),
  requiredFiles: z.array(z.string()).optional()
}).refine(
  (data) => data.executionMode !== 'docker' || data.docker !== undefined,
  { message: 'Docker configuration is required when executionMode is "docker"', path: ['docker'] }
);

export type Template = z.infer<typeof TemplateSchema>;

export const TemplateResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  executionMode: z.enum(['docker', 'native']).optional(),
  defaultPorts: z.array(TemplateDefaultPortSchema).optional()
});

export type TemplateResponse = z.infer<typeof TemplateResponseSchema>;
