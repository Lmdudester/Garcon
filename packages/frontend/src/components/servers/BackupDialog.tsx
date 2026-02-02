import { useState, useEffect } from 'react';
import type { ServerResponse, BackupResponse } from '@garcon/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { formatDate, formatBytes, copyToClipboard } from '@/lib/utils';
import { Download, Trash2, Plus, Loader2, FolderOpen } from 'lucide-react';

interface BackupDialogProps {
  server: ServerResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BackupDialog({ server, open, onOpenChange }: BackupDialogProps) {
  const [backups, setBackups] = useState<BackupResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      loadBackups();
    }
  }, [open, server.id]);

  const loadBackups = async () => {
    setLoading(true);
    try {
      const data = await api.backups.list(server.id);
      setBackups(data);
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to load backups',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const backup = await api.backups.create(server.id);
      setBackups(prev => [backup, ...prev]);
      toast({
        title: 'Success',
        description: 'Backup created successfully',
        variant: 'success'
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to create backup',
        variant: 'destructive'
      });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (timestamp: string) => {
    setDeleting(timestamp);
    try {
      await api.backups.delete(server.id, timestamp);
      setBackups(prev => prev.filter(b => b.timestamp !== timestamp));
      toast({
        title: 'Success',
        description: 'Backup deleted',
        variant: 'success'
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to delete backup',
        variant: 'destructive'
      });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Backups - {server.name}</DialogTitle>
          <DialogDescription>
            Manage backups for this server. Create manual backups or delete old ones.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Create Backup
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : backups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No backups yet. Create your first backup above.
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {backups.map((backup) => (
                <div
                  key={backup.timestamp}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Download className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">
                        {formatDate(backup.timestamp)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {backup.type} {backup.size ? `- ${formatBytes(backup.size)}` : ''}
                      </p>
                      <button
                        type="button"
                        className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 hover:underline mt-1"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const success = copyToClipboard(backup.filePath);
                          if (success) {
                            toast({
                              title: 'Copied',
                              description: 'File path copied to clipboard',
                              variant: 'default'
                            });
                          } else {
                            toast({
                              title: 'Copy failed',
                              description: 'Could not copy to clipboard',
                              variant: 'destructive'
                            });
                          }
                        }}
                        title={backup.filePath}
                      >
                        <FolderOpen className="h-3 w-3" />
                        <span className="truncate max-w-[300px]">{backup.filePath}</span>
                      </button>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(backup.timestamp)}
                    disabled={deleting === backup.timestamp}
                  >
                    {deleting === backup.timestamp ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 text-red-500" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
