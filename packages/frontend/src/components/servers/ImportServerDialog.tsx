import { useState, useEffect } from 'react';
import { Plus, Trash2, FolderOpen, Star } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useServers } from '@/context/ServerContext';
import { useToast } from '@/context/ToastContext';
import { api } from '@/lib/api';
import { cn, copyToClipboard } from '@/lib/utils';

interface PortMapping {
  host: number;
  container: number;
  protocol: 'tcp' | 'udp';
  description?: string;
  userFacing?: boolean;
}

export function ImportServerDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sourcePath, setSourcePath] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [ports, setPorts] = useState<PortMapping[]>([]);
  const [restartAfterMaintenance, setRestartAfterMaintenance] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [importPath, setImportPath] = useState<string | null>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);

  const { templates, importServer } = useServers();
  const { toast } = useToast();

  // Fetch import path and folders when dialog opens
  useEffect(() => {
    if (open) {
      if (!importPath) {
        api.config.getRuntime()
          .then((config) => setImportPath(config.importPath))
          .catch(() => setImportPath(null));
      }
      setFoldersLoading(true);
      api.config.listImportFolders()
        .then((res) => setFolders(res.folders))
        .catch(() => setFolders([]))
        .finally(() => setFoldersLoading(false));
    }
  }, [open, importPath]);

  // Update ports when template changes
  useEffect(() => {
    if (templateId) {
      const template = templates.find(t => t.id === templateId);
      if (template?.defaultPorts) {
        setPorts(template.defaultPorts.map((p, index) => ({
          host: p.container, // Default host port = container port
          container: p.container,
          protocol: p.protocol || 'tcp',
          description: p.description,
          userFacing: p.userFacing ?? (index === 0) // Default first port if none specified
        })));
      } else {
        setPorts([]);
      }
    } else {
      setPorts([]);
    }
  }, [templateId, templates]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !sourcePath || !templateId) return;

    setIsSubmitting(true);
    try {
      await importServer({
        name,
        description: description || undefined,
        sourcePath,
        templateId,
        ports: ports.map(p => ({
          host: p.host,
          container: p.container,
          protocol: p.protocol,
          userFacing: p.userFacing
        })),
        restartAfterMaintenance
      });
      setOpen(false);
      resetForm();
    } catch {
      // Error is handled by the context
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setSourcePath('');
    setTemplateId('');
    setPorts([]);
    setRestartAfterMaintenance(false);
  };

  const updatePort = (index: number, field: 'host' | 'container', value: number) => {
    setPorts(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p));
  };

  const updatePortProtocol = (index: number, protocol: 'tcp' | 'udp') => {
    setPorts(prev => prev.map((p, i) => i === index ? { ...p, protocol } : p));
  };

  const addPort = () => {
    const isFirst = ports.length === 0;
    setPorts(prev => [...prev, { host: 25565, container: 25565, protocol: 'tcp', description: undefined, userFacing: isFirst }]);
  };

  const removePort = (index: number) => {
    setPorts(prev => {
      const newPorts = prev.filter((_, i) => i !== index);
      // If removed port was user-facing, reassign to first remaining port
      if (prev[index]?.userFacing && newPorts.length > 0) {
        newPorts[0].userFacing = true;
      }
      return newPorts;
    });
  };

  const setUserFacingPort = (index: number) => {
    setPorts(prev => prev.map((p, i) => ({ ...p, userFacing: i === index })));
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) resetForm();
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-2 border-cyan-500/70 text-cyan-500/70 font-bold hover:bg-cyan-500/10 hover:text-cyan-400/80">
          <Plus className="h-4 w-4 mr-2" />
          Add Server
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Import Server</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Import a game server from the import folder. Place your server files there first.
                </p>
                {importPath && (
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">Import folder:</span>
                    <button
                      type="button"
                      className="flex items-center gap-1 text-blue-500 hover:text-blue-700 hover:underline"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const success = copyToClipboard(importPath);
                        if (success) {
                          toast({
                            title: 'Copied',
                            description: 'Import path copied to clipboard',
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
                      <FolderOpen className="h-3 w-3" />
                      <span>{importPath}</span>
                    </button>
                  </div>
                )}
              </div>
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
            <div className="grid gap-2">
              <Label htmlFor="sourcePath">Folder Name</Label>
              <Select value={sourcePath} onValueChange={setSourcePath}>
                <SelectTrigger>
                  <SelectValue placeholder={foldersLoading ? 'Loading folders...' : 'Select a folder'} />
                </SelectTrigger>
                <SelectContent>
                  {folders.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      No folders found in import directory
                    </div>
                  ) : (
                    folders.map((folder) => (
                      <SelectItem key={folder} value={folder}>
                        {folder}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Name of your server folder within the import directory
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="template">Game Template</Label>
              <Select value={templateId} onValueChange={setTemplateId} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select a template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>Port Mappings</Label>
                <Button type="button" variant="outline" size="sm" onClick={addPort}>
                  <Plus className="h-3 w-3 mr-1" />
                  Add Port
                </Button>
              </div>
              {ports.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {templateId ? 'No ports configured. Click "Add Port" to add one.' : 'Select a template to load default ports.'}
                </p>
              ) : (
                <div className="space-y-2">
                  {ports.map((port, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setUserFacingPort(index)}
                        className={cn(
                          "p-1 rounded-full shrink-0",
                          port.userFacing ? "text-yellow-500" : "text-muted-foreground hover:text-foreground"
                        )}
                        title={port.userFacing ? "User-facing port" : "Set as user-facing port"}
                      >
                        <Star className={cn("h-4 w-4", port.userFacing && "fill-current")} />
                      </button>
                      <div className="flex-1">
                        <Input
                          type="number"
                          min={1}
                          max={65535}
                          value={port.host}
                          onChange={(e) => updatePort(index, 'host', parseInt(e.target.value) || 0)}
                          placeholder="Host port"
                        />
                      </div>
                      <span className="text-muted-foreground">→</span>
                      <div className="flex-1">
                        <Input
                          type="number"
                          min={1}
                          max={65535}
                          value={port.container}
                          onChange={(e) => updatePort(index, 'container', parseInt(e.target.value) || 0)}
                          placeholder="Container port"
                        />
                      </div>
                      <Select
                        value={port.protocol}
                        onValueChange={(v) => updatePortProtocol(index, v as 'tcp' | 'udp')}
                      >
                        <SelectTrigger className="w-20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tcp">TCP</SelectItem>
                          <SelectItem value="udp">UDP</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removePort(index)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">
                    Host port → Container port. <Star className="h-3 w-3 inline text-yellow-500 fill-current" /> = shown to players.
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="restartAfterMaintenance">Auto-restart after maintenance</Label>
                <p className="text-xs text-muted-foreground">
                  Automatically restart this server after scheduled 4 AM maintenance
                </p>
              </div>
              <Switch
                id="restartAfterMaintenance"
                checked={restartAfterMaintenance}
                onCheckedChange={setRestartAfterMaintenance}
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
            <Button type="submit" disabled={isSubmitting || !name || !sourcePath || !templateId}>
              {isSubmitting ? 'Importing...' : 'Import Server'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
