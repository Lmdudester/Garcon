import { z } from 'zod';

export const ReorderRequestSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

export type ReorderRequest = z.infer<typeof ReorderRequestSchema>;
