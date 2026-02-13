import { useState, useEffect } from 'react';
import type { WebAppResponse, AvailableContainer } from '@garcon/shared';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useWebApps } from '@/context/WebAppContext';
import { api } from '@/lib/api';

interface EditWebAppDialogProps {
  webApp: WebAppResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditWebAppDialog({ webApp, open, onOpenChange }: EditWebAppDialogProps) {
  const [containerName, setContainerName] = useState(webApp.containerName);
  const [url, setUrl] = useState(webApp.url);
  const [name, setName] = useState(webApp.name ?? '');
  const [description, setDescription] = useState(webApp.description ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [containers, setContainers] = useState<AvailableContainer[]>([]);
  const [loadingContainers, setLoadingContainers] = useState(false);

  const { editWebApp } = useWebApps();

  // Reset form when dialog opens or webApp changes
  useEffect(() => {
    if (open) {
      setContainerName(webApp.containerName);
      setUrl(webApp.url);
      setName(webApp.name ?? '');
      setDescription(webApp.description ?? '');
    }
  }, [open, webApp]);

  // Fetch available containers when dialog opens
  useEffect(() => {
    if (open) {
      setLoadingContainers(true);
      api.webApps.listContainers()
        .then((available) => {
          // Include the currently assigned container even if it would be filtered
          const currentIncluded = available.some(c => c.name === webApp.containerName);
          if (!currentIncluded) {
            setContainers([
              { name: webApp.containerName, status: webApp.containerStatus === 'running' ? 'running' : 'stopped' },
              ...available,
            ]);
          } else {
            setContainers(available);
          }
        })
        .catch(() => {
          setContainers([{ name: webApp.containerName, status: webApp.containerStatus === 'running' ? 'running' : 'stopped' }]);
        })
        .finally(() => setLoadingContainers(false));
    }
  }, [open, webApp.containerName, webApp.containerStatus]);

  const hasChanges =
    containerName !== webApp.containerName ||
    url !== webApp.url ||
    name.trim() !== (webApp.name ?? '') ||
    description.trim() !== (webApp.description ?? '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasChanges) return;

    setIsSubmitting(true);
    try {
      const data: Record<string, string | null> = {};
      if (containerName !== webApp.containerName) data.containerName = containerName;
      if (url !== webApp.url) data.url = url;
      const trimmedName = name.trim();
      if (trimmedName !== (webApp.name ?? '')) {
        data.name = trimmedName || null;
      }
      const trimmedDesc = description.trim();
      if (trimmedDesc !== (webApp.description ?? '')) {
        data.description = trimmedDesc || null;
      }

      await editWebApp(webApp.id, data);
      onOpenChange(false);
    } catch {
      // Error is handled by the context
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Web App</DialogTitle>
            <DialogDescription>
              Update the container or URL for this web app link.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-container">Docker Container</Label>
              <Select value={containerName} onValueChange={setContainerName}>
                <SelectTrigger>
                  <SelectValue placeholder={loadingContainers ? 'Loading...' : 'Select a container'} />
                </SelectTrigger>
                <SelectContent>
                  {containers.map((c) => (
                    <SelectItem key={c.name} value={c.name}>
                      <span className="flex items-center gap-2">
                        {c.name}
                        <span className={`text-xs ${c.status === 'running' ? 'text-green-500' : 'text-muted-foreground'}`}>
                          ({c.status})
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-url">URL</Label>
              <Input
                id="edit-url"
                type="url"
                placeholder="https://app.example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Name <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                id="edit-name"
                placeholder="Custom display name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
              />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-description">Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <span className="text-xs text-muted-foreground">{description.length}/250</span>
              </div>
              <Textarea
                id="edit-description"
                placeholder="Custom description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={250}
                rows={2}
              />
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
            <Button type="submit" disabled={isSubmitting || !hasChanges || !containerName || !url}>
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
