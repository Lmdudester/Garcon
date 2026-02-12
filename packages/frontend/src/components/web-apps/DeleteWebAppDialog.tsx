import { useState } from 'react';
import type { WebAppResponse } from '@garcon/shared';
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
import { useWebApps } from '@/context/WebAppContext';

interface DeleteWebAppDialogProps {
  webApp: WebAppResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteWebAppDialog({ webApp, open, onOpenChange }: DeleteWebAppDialogProps) {
  const { deleteWebApp } = useWebApps();
  const [isDeleting, setIsDeleting] = useState(false);

  const displayName = webApp.metadata.title || webApp.containerName;

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteWebApp(webApp.id);
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
          <AlertDialogTitle>Remove Web App</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to remove "{displayName}"? This only removes the link
            from Garcon — the Docker container will not be affected.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isDeleting}
            className="bg-red-500 text-white hover:bg-red-600"
          >
            {isDeleting ? 'Removing...' : 'Remove'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
