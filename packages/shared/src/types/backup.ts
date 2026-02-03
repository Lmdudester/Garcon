import { z } from 'zod';

export const BackupTypeSchema = z.enum(['manual', 'auto', 'pre-update', 'pre-restore']);

export type BackupType = z.infer<typeof BackupTypeSchema>;

export const BackupSchema = z.object({
  serverId: z.string().min(1),
  timestamp: z.string().datetime(),
  type: BackupTypeSchema,
  size: z.number().optional(),
  description: z.string().optional()
});

export type Backup = z.infer<typeof BackupSchema>;

export const BackupResponseSchema = z.object({
  serverId: z.string().min(1),
  timestamp: z.string().datetime(),
  type: BackupTypeSchema,
  size: z.number().optional(),
  description: z.string().optional(),
  fileName: z.string(),
  filePath: z.string()
});

export type BackupResponse = z.infer<typeof BackupResponseSchema>;

export const CreateBackupRequestSchema = z.object({
  description: z.string().optional()
});

export type CreateBackupRequest = z.infer<typeof CreateBackupRequestSchema>;

export const RestoreBackupResponseSchema = z.object({
  serverId: z.string(),
  restoredFrom: z.string().datetime(),
  preRestoreBackup: BackupResponseSchema.optional()
});

export type RestoreBackupResponse = z.infer<typeof RestoreBackupResponseSchema>;
