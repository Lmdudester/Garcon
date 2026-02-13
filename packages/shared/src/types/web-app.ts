import { z } from 'zod';

export const ContainerStatusSchema = z.enum(['running', 'stopped', 'unknown']);
export type ContainerStatus = z.infer<typeof ContainerStatusSchema>;

export const WebAppLinkSchema = z.object({
  id: z.string().min(1),
  containerName: z.string().min(1),
  url: z.string().url(),
  name: z.string().min(1).max(100).nullable().optional(),
  description: z.string().max(250).nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type WebAppLink = z.infer<typeof WebAppLinkSchema>;

export const WebAppMetadataSchema = z.object({
  title: z.string().nullable(),
  description: z.string().nullable(),
  faviconUrl: z.string().nullable(),
});

export type WebAppMetadata = z.infer<typeof WebAppMetadataSchema>;

export const WebAppResponseSchema = WebAppLinkSchema.extend({
  containerStatus: ContainerStatusSchema,
  metadata: WebAppMetadataSchema,
});

export type WebAppResponse = z.infer<typeof WebAppResponseSchema>;

export const CreateWebAppRequestSchema = z.object({
  containerName: z.string().min(1),
  url: z.string().url(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(250).optional(),
});

export type CreateWebAppRequest = z.infer<typeof CreateWebAppRequestSchema>;

export const UpdateWebAppRequestSchema = z.object({
  containerName: z.string().min(1).optional(),
  url: z.string().url().optional(),
  name: z.string().min(1).max(100).nullable().optional(),
  description: z.string().max(250).nullable().optional(),
});

export type UpdateWebAppRequest = z.infer<typeof UpdateWebAppRequestSchema>;

export const AvailableContainerSchema = z.object({
  name: z.string(),
  status: z.enum(['running', 'stopped']),
});

export type AvailableContainer = z.infer<typeof AvailableContainerSchema>;
