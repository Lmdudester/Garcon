import { useState, useEffect } from 'react';
import type { ServerResponse } from '@garcon/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useServers } from '@/context/ServerContext';

interface EditServerDialogProps {
  server: ServerResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditServerDialog({ server, open, onOpenChange }: EditServerDialogProps) {
  const [name, setName] = useState(server.name);
  const [description, setDescription] = useState(server.description || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { editServer } = useServers();

  // Reset form when dialog opens or server changes
  useEffect(() => {
    if (open) {
      setName(server.name);
      setDescription(server.description || '');
    }
  }, [open, server.name, server.description]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !hasChanges) return;

    setIsSubmitting(true);
    try {
      await editServer(server.id, {
        name,
        description: description || undefined
      });
      onOpenChange(false);
    } catch {
      // Error is handled by the context
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasChanges = name !== server.name || description !== (server.description || '');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Server</DialogTitle>
            <DialogDescription>
              Update the server settings. Some settings like ports and source folder
              cannot be changed after creation.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Server Name</Label>
              <Input
                id="name"
                placeholder="My Minecraft Server"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                placeholder="A brief description of this server..."
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 250))}
                maxLength={250}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                {description.length}/250 characters
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !name || !hasChanges}>
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
