import { useState } from 'react';
import type { ServerResponse } from '@garcon/shared';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useServers } from '@/context/ServerContext';
import { useViewMode } from '@/context/ViewModeContext';
import { Play, Square, RotateCcw, MoreVertical, Download, RefreshCw, Trash2, AlertTriangle, Pencil } from 'lucide-react';
import { DeleteServerDialog } from './DeleteServerDialog';
import { BackupDialog } from './BackupDialog';
import { UpdateWorkflow } from './UpdateWorkflow';
import { EditServerDialog } from './EditServerDialog';

interface ServerControlsProps {
  server: ServerResponse;
}

export function ServerControls({ server }: ServerControlsProps) {
  const { startServer, stopServer, restartServer, acknowledgeCrash } = useServers();
  const { isAdmin } = useViewMode();
  const [isLoading, setIsLoading] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [backupDialogOpen, setBackupDialogOpen] = useState(false);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);

  const isRunning = server.status === 'running';
  const isStopped = server.status === 'stopped';
  const isCrashed = server.status === 'error';
  const isTransitioning = ['starting', 'stopping', 'updating'].includes(server.status);
  const isUpdating = server.updateStage !== 'none';

  const handleStart = async () => {
    setIsLoading(true);
    try {
      await startServer(server.id);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStop = async () => {
    setIsLoading(true);
    try {
      await stopServer(server.id);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestart = async () => {
    setIsLoading(true);
    try {
      await restartServer(server.id);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAcknowledgeCrash = async () => {
    setIsLoading(true);
    try {
      await acknowledgeCrash(server.id);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {isStopped && !isUpdating && (
        <Button
          size="sm"
          onClick={handleStart}
          disabled={isLoading || isTransitioning}
        >
          <Play className="h-4 w-4 mr-1" />
          Start
        </Button>
      )}

      {isRunning && (
        <>
          <Button
            size="sm"
            variant="secondary"
            onClick={handleStop}
            disabled={isLoading || isTransitioning}
          >
            <Square className="h-4 w-4 mr-1" />
            Stop
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRestart}
            disabled={isLoading || isTransitioning}
          >
            <RotateCcw className="h-4 w-4 mr-1" />
            Restart
          </Button>
        </>
      )}

      {isCrashed && (
        <Button
          size="sm"
          variant="destructive"
          onClick={handleAcknowledgeCrash}
          disabled={isLoading}
        >
          <AlertTriangle className="h-4 w-4 mr-1" />
          Acknowledge Crash
        </Button>
      )}

      {isAdmin && isUpdating && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setUpdateDialogOpen(true)}
        >
          <RefreshCw className="h-4 w-4 mr-1" />
          Continue Update
        </Button>
      )}

      {isAdmin && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" disabled={isTransitioning}>
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditDialogOpen(true)}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setBackupDialogOpen(true)}>
              <Download className="h-4 w-4 mr-2" />
              Backups
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setUpdateDialogOpen(true)}
              disabled={isRunning || isUpdating}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Update Server
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setDeleteDialogOpen(true)}
              className="text-red-500"
              disabled={isRunning}
            >
              <Trash2 className="h-4 w-4 mr-2 text-red-500" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {isAdmin && (
        <>
          <EditServerDialog
            server={server}
            open={editDialogOpen}
            onOpenChange={setEditDialogOpen}
          />

          <DeleteServerDialog
            server={server}
            open={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
          />

          <BackupDialog
            server={server}
            open={backupDialogOpen}
            onOpenChange={setBackupDialogOpen}
          />

          <UpdateWorkflow
            server={server}
            open={updateDialogOpen}
            onOpenChange={setUpdateDialogOpen}
          />
        </>
      )}
    </div>
  );
}
