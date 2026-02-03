import { z } from 'zod';

export const RuntimeConfigResponseSchema = z.object({
  importPath: z.string()
});

export type RuntimeConfigResponse = z.infer<typeof RuntimeConfigResponseSchema>;
