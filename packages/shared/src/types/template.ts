import { z } from 'zod';

export const TemplateDockerConfigSchema = z.object({
  baseImage: z.string(),
  mountPath: z.string().default('/server'),
  workDir: z.string().optional(),
  additionalMounts: z.array(z.object({
    host: z.string(),
    container: z.string(),
    readOnly: z.boolean().default(false)
  })).optional()
});

export type TemplateDockerConfig = z.infer<typeof TemplateDockerConfigSchema>;

export const TemplateExecutionConfigSchema = z.object({
  executable: z.string(),
  command: z.string(),
  stopCommand: z.string().optional(),
  stopTimeout: z.number().default(30)
});

export type TemplateExecutionConfig = z.infer<typeof TemplateExecutionConfigSchema>;

export const TemplateDefaultPortSchema = z.object({
  container: z.number().int().min(1).max(65535),
  protocol: z.enum(['tcp', 'udp']).default('tcp'),
  description: z.string().optional(),
  userFacing: z.boolean().optional()
});

export type TemplateDefaultPort = z.infer<typeof TemplateDefaultPortSchema>;

export const TemplateVariableSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  defaultValue: z.string().optional(),
  required: z.boolean().default(false)
});

export type TemplateVariable = z.infer<typeof TemplateVariableSchema>;

export const TemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  docker: TemplateDockerConfigSchema,
  execution: TemplateExecutionConfigSchema,
  defaultPorts: z.array(TemplateDefaultPortSchema).optional(),
  variables: z.array(TemplateVariableSchema).optional(),
  requiredFiles: z.array(z.string()).optional()
});

export type Template = z.infer<typeof TemplateSchema>;

export const TemplateResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  defaultPorts: z.array(TemplateDefaultPortSchema).optional(),
  variables: z.array(TemplateVariableSchema).optional()
});

export type TemplateResponse = z.infer<typeof TemplateResponseSchema>;
