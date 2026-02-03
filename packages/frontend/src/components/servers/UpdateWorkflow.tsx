import { useState, useEffect } from 'react';
import type { ServerResponse } from '@garcon/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useServers } from '@/context/ServerContext';
import { useToast } from '@/context/ToastContext';
import { api } from '@/lib/api';
import { copyToClipboard } from '@/lib/utils';
import { CheckCircle2, Circle, Loader2, FolderOpen, XCircle, Archive } from 'lucide-react';

interface UpdateWorkflowProps {
  server: ServerResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Stage = 'not_started' | 'initiated' | 'ready';

export function UpdateWorkflow({ server, open, onOpenChange }: UpdateWorkflowProps) {
  const { initiateUpdate, applyUpdate, cancelUpdate } = useServers();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [backupPath, setBackupPath] = useState<string | null>(null);
  const [hostSourcePath, setHostSourcePath] = useState<string>(server.sourcePath);

  // Derive stage from server state
  const stage: Stage = server.updateStage === 'none' ? 'not_started' : 'initiated';

  // Convert container path to host path for display
  useEffect(() => {
    if (open) {
      api.config.getRuntime()
        .then((config) => {
          // Replace /garcon-import prefix with the host import path
          const containerPrefix = '/garcon-import';
          if (server.sourcePath.startsWith(containerPrefix)) {
            const relativePath = server.sourcePath.slice(containerPrefix.length);
            setHostSourcePath(config.importPath + relativePath);
          } else {
            setHostSourcePath(server.sourcePath);
          }
        })
        .catch(() => setHostSourcePath(server.sourcePath));
    }
  }, [open, server.sourcePath]);

  const handleInitiate = async () => {
    setLoading(true);
    try {
      const result = await initiateUpdate(server.id);
      setBackupPath(result.backupPath);
      // Stage will update via server state refresh
    } catch {
      // Error handled by context
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    setLoading(true);
    try {
      await applyUpdate(server.id);
      onOpenChange(false);
    } catch {
      // Error handled by context
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    setLoading(true);
    try {
      await cancelUpdate(server.id);
      onOpenChange(false);
    } catch {
      // Error handled by context
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  const StepIndicator = ({ step, current }: { step: number; current: number }) => {
    if (step < current) {
      return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    }
    if (step === current) {
      return loading ? (
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      ) : (
        <Circle className="h-5 w-5 text-primary fill-primary" />
      );
    }
    return <Circle className="h-5 w-5 text-muted-foreground" />;
  };

  const currentStep = stage === 'not_started' ? 1 : stage === 'initiated' ? 2 : 3;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Update Server - {server.name}</DialogTitle>
          <DialogDescription>
            Follow the steps below to update your server files safely.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="flex items-start gap-3">
            <StepIndicator step={1} current={currentStep} />
            <div>
              <p className="font-medium">Initiate Update</p>
              <p className="text-sm text-muted-foreground">
                Stop the server and create a backup before updating.
              </p>
              {stage === 'initiated' && backupPath && (
                <div className="mt-2 p-2 bg-muted rounded flex items-center gap-2">
                  <Archive className="h-4 w-4 text-green-500 shrink-0" />
                  <button
                    type="button"
                    className="text-xs break-all text-blue-500 hover:text-blue-700 hover:underline text-left"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const success = copyToClipboard(backupPath);
                      if (success) {
                        toast({
                          title: 'Copied',
                          description: 'Backup path copied to clipboard',
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
                    title="Click to copy backup path"
                  >
                    {backupPath}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-start gap-3">
            <StepIndicator step={2} current={currentStep} />
            <div>
              <p className="font-medium">Update Source Files</p>
              <p className="text-sm text-muted-foreground">
                Copy your updated server files to the source folder.
              </p>
              {stage === 'initiated' && (
                <div className="mt-2 p-2 bg-muted rounded flex items-center gap-2">
                  <FolderOpen className="h-4 w-4 text-blue-500 shrink-0" />
                  <button
                    type="button"
                    className="text-xs break-all text-blue-500 hover:text-blue-700 hover:underline text-left"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const success = copyToClipboard(hostSourcePath);
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
                    title="Click to copy path"
                  >
                    {hostSourcePath}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-start gap-3">
            <StepIndicator step={3} current={currentStep} />
            <div>
              <p className="font-medium">Apply Update</p>
              <p className="text-sm text-muted-foreground">
                Copy the updated files to the server.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {stage === 'not_started' && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleInitiate} disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Start Update
              </Button>
            </>
          )}

          {stage === 'initiated' && (
            <>
              <Button variant="outline" onClick={handleCancel} disabled={loading}>
                <XCircle className="h-4 w-4 mr-2" />
                Cancel Update
              </Button>
              <Button onClick={handleApply} disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Apply Update
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
