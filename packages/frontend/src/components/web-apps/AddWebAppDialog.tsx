import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import type { AvailableContainer } from '@garcon/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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

export function AddWebAppDialog() {
  const [open, setOpen] = useState(false);
  const [containerName, setContainerName] = useState('');
  const [url, setUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [containers, setContainers] = useState<AvailableContainer[]>([]);
  const [loadingContainers, setLoadingContainers] = useState(false);

  const { createWebApp } = useWebApps();

  useEffect(() => {
    if (open) {
      setLoadingContainers(true);
      api.webApps.listContainers()
        .then(setContainers)
        .catch(() => setContainers([]))
        .finally(() => setLoadingContainers(false));
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!containerName || !url) return;

    setIsSubmitting(true);
    try {
      await createWebApp({ containerName, url });
      setOpen(false);
      resetForm();
    } catch {
      // Error is handled by the context
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setContainerName('');
    setUrl('');
    setContainers([]);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) resetForm();
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-2 border-cyan-500/70 text-cyan-500/70 font-bold hover:bg-cyan-500/10 hover:text-cyan-400/80">
          <Plus className="h-4 w-4 mr-2" />
          Add Web App
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Web App</DialogTitle>
            <DialogDescription>
              Link a Docker container running a web application to your dashboard.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="container">Docker Container</Label>
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
              <Label htmlFor="url">URL</Label>
              <Input
                id="url"
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
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !containerName || !url}>
              {isSubmitting ? 'Adding...' : 'Add Web App'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
