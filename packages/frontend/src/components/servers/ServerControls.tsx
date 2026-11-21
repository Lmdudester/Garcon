import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FocusEvent } from 'react';
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

const STOP_CONFIRMATION_SECONDS = 5;
const STOP_CONFIRMATION_DURATION_MS = STOP_CONFIRMATION_SECONDS * 1000;

interface StopConfirmation {
  serverId: string;
  expiresAt: number;
}

export function ServerControls({ server }: ServerControlsProps) {
  const { startServer, stopServer, restartServer, acknowledgeCrash, templates } = useServers();
  const { isAdmin } = useViewMode();
  const template = templates.find(t => t.id === server.templateId);
  const isNative = template?.executionMode === 'native';
  const [isLoading, setIsLoading] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [backupDialogOpen, setBackupDialogOpen] = useState(false);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [stopConfirmation, setStopConfirmation] = useState<StopConfirmation | null>(null);
  const [stopConfirmationSeconds, setStopConfirmationSeconds] = useState(0);
  const [stopConfirmationAnnouncement, setStopConfirmationAnnouncement] = useState('');
  const [stopConfirmationAnnouncementKey, setStopConfirmationAnnouncementKey] = useState(0);

  const isRunning = server.status === 'running';
  const isStopped = server.status === 'stopped';
  const isCrashed = server.status === 'error';
  const isTransitioning = ['starting', 'stopping', 'updating'].includes(server.status);
  const isUpdating = server.updateStage !== 'none';

  const controlsRef = useRef<HTMLDivElement>(null);
  const stopButtonRef = useRef<HTMLButtonElement>(null);
  const confirmationOwnsFocusRef = useRef(false);
  const statusChangeFocusRef = useRef(false);
  const isRunningRef = useRef(isRunning);
  const blurCheckFrameRef = useRef<number | null>(null);
  const focusRestorationFrameRef = useRef<number | null>(null);
  const announcementFrameRef = useRef<number | null>(null);

  const clearStopConfirmationAnnouncement = useCallback(() => {
    if (announcementFrameRef.current !== null) {
      window.cancelAnimationFrame(announcementFrameRef.current);
      announcementFrameRef.current = null;
    }
    setStopConfirmationAnnouncement('');
  }, []);

  const announceStopConfirmation = useCallback((message: string) => {
    if (announcementFrameRef.current !== null) {
      window.cancelAnimationFrame(announcementFrameRef.current);
    }

    setStopConfirmationAnnouncement('');
    setStopConfirmationAnnouncementKey(key => key + 1);
    announcementFrameRef.current = window.requestAnimationFrame(() => {
      setStopConfirmationAnnouncement(message);
      announcementFrameRef.current = null;
    });
  }, []);

  const expireStopConfirmation = useCallback((confirmation: StopConfirmation) => {
    setStopConfirmation(current => {
      if (
        current?.serverId !== confirmation.serverId ||
        current.expiresAt !== confirmation.expiresAt
      ) {
        return current;
      }
      return null;
    });
    setStopConfirmationSeconds(0);
    confirmationOwnsFocusRef.current = false;
    announceStopConfirmation('Server stop confirmation expired.');
  }, [announceStopConfirmation]);

  useLayoutEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  useLayoutEffect(() => {
    if (isRunning || stopConfirmation?.serverId !== server.id) {
      statusChangeFocusRef.current = false;
    }

    return () => {
      if (
        isRunning &&
        stopConfirmation?.serverId === server.id &&
        document.activeElement === stopButtonRef.current
      ) {
        statusChangeFocusRef.current = true;
      }
    };
  }, [isRunning, server.id, stopConfirmation]);

  useEffect(() => {
    if (!stopConfirmation || stopConfirmation.serverId !== server.id) {
      return;
    }

    const updateCountdown = () => {
      const remainingMilliseconds = stopConfirmation.expiresAt - Date.now();
      if (remainingMilliseconds <= 0) {
        expireStopConfirmation(stopConfirmation);
        return;
      }

      setStopConfirmationSeconds(Math.ceil(remainingMilliseconds / 1000));
    };

    updateCountdown();
    const interval = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(interval);
  }, [expireStopConfirmation, server.id, stopConfirmation]);

  useEffect(() => {
    if (!stopConfirmation || stopConfirmation.serverId === server.id) {
      return;
    }

    setStopConfirmation(null);
    setStopConfirmationSeconds(0);
    confirmationOwnsFocusRef.current = false;
    statusChangeFocusRef.current = false;
    clearStopConfirmationAnnouncement();
  }, [clearStopConfirmationAnnouncement, server.id, stopConfirmation]);

  useEffect(() => {
    if (isRunning || stopConfirmation?.serverId !== server.id) {
      return;
    }

    const shouldRestoreFocus = statusChangeFocusRef.current;
    statusChangeFocusRef.current = false;
    setStopConfirmation(null);
    setStopConfirmationSeconds(0);
    confirmationOwnsFocusRef.current = false;
    announceStopConfirmation('Server stop confirmation cancelled because the server status changed.');

    if (shouldRestoreFocus) {
      if (focusRestorationFrameRef.current !== null) {
        window.cancelAnimationFrame(focusRestorationFrameRef.current);
      }
      focusRestorationFrameRef.current = window.requestAnimationFrame(() => {
        const controls = controlsRef.current;
        if (!controls) {
          focusRestorationFrameRef.current = null;
          return;
        }

        const nextButton = controls.querySelector<HTMLButtonElement>('button:not(:disabled)');
        (nextButton ?? controls).focus();
        focusRestorationFrameRef.current = null;
      });
    }
  }, [announceStopConfirmation, isRunning, server.id, stopConfirmation]);

  useEffect(() => {
    return () => {
      if (blurCheckFrameRef.current !== null) {
        window.cancelAnimationFrame(blurCheckFrameRef.current);
      }
      if (focusRestorationFrameRef.current !== null) {
        window.cancelAnimationFrame(focusRestorationFrameRef.current);
      }
      if (announcementFrameRef.current !== null) {
        window.cancelAnimationFrame(announcementFrameRef.current);
      }
    };
  }, []);

  const handleStart = async () => {
    setIsLoading(true);
    try {
      await startServer(server.id);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopRequest = () => {
    statusChangeFocusRef.current = false;
    setStopConfirmation({
      serverId: server.id,
      expiresAt: Date.now() + STOP_CONFIRMATION_DURATION_MS,
    });
    setStopConfirmationSeconds(STOP_CONFIRMATION_SECONDS);
    confirmationOwnsFocusRef.current = document.activeElement === stopButtonRef.current;
    announceStopConfirmation('Server stop confirmation active. Confirm within five seconds.');
  };

  const handleConfirmedStop = async () => {
    const confirmation = stopConfirmation;
    if (!confirmation || confirmation.serverId !== server.id) {
      return;
    }

    if (Date.now() >= confirmation.expiresAt) {
      expireStopConfirmation(confirmation);
      return;
    }

    setStopConfirmation(null);
    setStopConfirmationSeconds(0);
    confirmationOwnsFocusRef.current = false;
    clearStopConfirmationAnnouncement();
    setIsLoading(true);
    try {
      await stopServer(confirmation.serverId);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmationFocus = () => {
    confirmationOwnsFocusRef.current = true;
  };

  const handleConfirmationBlur = (_event: FocusEvent<HTMLButtonElement>) => {
    if (blurCheckFrameRef.current !== null) {
      window.cancelAnimationFrame(blurCheckFrameRef.current);
    }
    blurCheckFrameRef.current = window.requestAnimationFrame(() => {
      blurCheckFrameRef.current = null;
      if (isRunningRef.current && document.activeElement !== stopButtonRef.current) {
        confirmationOwnsFocusRef.current = false;
      }
    });
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

  const isStopConfirmationActive = stopConfirmation?.serverId === server.id;

  return (
    <div
      ref={controlsRef}
      role="group"
      aria-label="Server controls"
      tabIndex={-1}
      className="flex items-center gap-2 flex-wrap"
    >
      <span
        key={stopConfirmationAnnouncementKey}
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {stopConfirmationAnnouncement}
      </span>
      {isStopped && !isUpdating && (
        <Button
          size="sm"
          className="bg-green-700 text-white hover:bg-green-800"
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
            ref={stopButtonRef}
            size="sm"
            className="bg-red-600 text-white hover:bg-red-700"
            onClick={isStopConfirmationActive ? handleConfirmedStop : handleStopRequest}
            disabled={isLoading || isTransitioning}
            onFocus={handleConfirmationFocus}
            onBlur={handleConfirmationBlur}
          >
            <Square className="h-4 w-4 mr-1" />
            {isStopConfirmationActive
              ? `Confirm Server Stop (${stopConfirmationSeconds})`
              : 'Stop'}
          </Button>
          {!isNative && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleRestart}
              disabled={isLoading || isTransitioning}
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Restart
            </Button>
          )}
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
