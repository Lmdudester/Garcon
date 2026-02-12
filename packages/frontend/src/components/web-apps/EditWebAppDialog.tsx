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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [containers, setContainers] = useState<AvailableContainer[]>([]);
  const [loadingContainers, setLoadingContainers] = useState(false);

  const { editWebApp } = useWebApps();

  // Reset form when dialog opens or webApp changes
  useEffect(() => {
    if (open) {
      setContainerName(webApp.containerName);
      setUrl(webApp.url);
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

  const hasChanges = containerName !== webApp.containerName || url !== webApp.url;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasChanges) return;

    setIsSubmitting(true);
    try {
      const data: Record<string, string> = {};
      if (containerName !== webApp.containerName) data.containerName = containerName;
      if (url !== webApp.url) data.url = url;

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
