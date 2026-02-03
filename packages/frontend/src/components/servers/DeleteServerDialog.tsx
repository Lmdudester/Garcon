import { useState } from 'react';
import type { ServerResponse } from '@garcon/shared';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useServers } from '@/context/ServerContext';

interface DeleteServerDialogProps {
  server: ServerResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteServerDialog({ server, open, onOpenChange }: DeleteServerDialogProps) {
  const { deleteServer } = useServers();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteServer(server.id);
      onOpenChange(false);
    } catch {
      // Error is handled by the context
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Server</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete "{server.name}"? This will permanently
            remove all server files. Backups will be preserved.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isDeleting}
            className="bg-red-500 text-white hover:bg-red-600"
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
