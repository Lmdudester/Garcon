import * as React from 'react';
import type { ServerResponse, CreateServerRequest, UpdateServerRequest, TemplateResponse } from '@garcon/shared';
import { api, ApiError } from '@/lib/api';
import { useToast } from './ToastContext';
import { useWebSocket } from './WebSocketContext';

interface ServerContextValue {
  servers: ServerResponse[];
  templates: TemplateResponse[];
  loading: boolean;
  error: string | null;
  refreshServers: () => Promise<void>;
  refreshTemplates: () => Promise<void>;
  importServer: (data: CreateServerRequest) => Promise<ServerResponse>;
  editServer: (id: string, data: UpdateServerRequest) => Promise<ServerResponse>;
  deleteServer: (id: string) => Promise<void>;
  startServer: (id: string) => Promise<void>;
  stopServer: (id: string) => Promise<void>;
  restartServer: (id: string) => Promise<void>;
  acknowledgeCrash: (id: string) => Promise<void>;
  initiateUpdate: (id: string) => Promise<{ sourcePath: string; backupTimestamp: string; backupPath: string }>;
  applyUpdate: (id: string) => Promise<void>;
  cancelUpdate: (id: string) => Promise<void>;
  reorderServers: (orderedIds: string[]) => Promise<void>;
}

const ServerContext = React.createContext<ServerContextValue | undefined>(undefined);

export function ServerProvider({ children }: { children: React.ReactNode }) {
  const [servers, setServers] = React.useState<ServerResponse[]>([]);
  const [templates, setTemplates] = React.useState<TemplateResponse[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const { toast } = useToast();
  const { isConnected, onServerStatus, onServerUpdate } = useWebSocket();

  const refreshServers = React.useCallback(async () => {
    try {
      const data = await api.servers.list();
      setServers(data);
      setError(null);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to load servers';
      setError(message);
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  }, [toast]);

  const refreshTemplates = React.useCallback(async () => {
    try {
      const data = await api.templates.list();
      setTemplates(data);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to load templates';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  }, [toast]);

  React.useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([refreshServers(), refreshTemplates()]);
      setLoading(false);
    };
    load();
  }, [refreshServers, refreshTemplates]);

  // Refresh server data when WebSocket connects to ensure we have latest status
  React.useEffect(() => {
    if (isConnected) {
      refreshServers();
    }
  }, [isConnected, refreshServers]);

  // Periodically refresh server data to avoid stale status
  React.useEffect(() => {
    const interval = setInterval(() => {
      refreshServers();
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [refreshServers]);

  React.useEffect(() => {
    const unsubStatus = onServerStatus((message) => {
      setServers(prev => prev.map(server => {
        if (server.id === message.serverId) {
          return {
            ...server,
            status: message.status,
            startedAt: message.startedAt,
            updateStage: message.updateStage ?? server.updateStage
          };
        }
        return server;
      }));
    });

    const unsubUpdate = onServerUpdate((message) => {
      if (message.action === 'deleted') {
        setServers(prev => prev.filter(s => s.id !== message.serverId));
      } else {
        refreshServers();
      }
    });

    return () => {
      unsubStatus();
      unsubUpdate();
    };
  }, [onServerStatus, onServerUpdate, refreshServers]);

  const importServer = React.useCallback(async (data: CreateServerRequest) => {
    try {
      const server = await api.servers.create(data);
      setServers(prev => [...prev, server]);
      toast({ title: 'Success', description: `Server "${server.name}" imported successfully`, variant: 'success' });
      return server;
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to import server';
      toast({ title: 'Error', description: message, variant: 'destructive' });
      throw err;
    }
  }, [toast]);

  const editServer = React.useCallback(async (id: string, data: UpdateServerRequest) => {
    try {
      const server = await api.servers.edit(id, data);
      setServers(prev => prev.map(s => s.id === id ? server : s));
      toast({ title: 'Success', description: 'Server updated successfully', variant: 'success' });
      return server;
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to update server';
      toast({ title: 'Error', description: message, variant: 'destructive' });
      throw err;
    }
  }, [toast]);

  const deleteServer = React.useCallback(async (id: string) => {
    try {
      await api.servers.delete(id);
      setServers(prev => prev.filter(s => s.id !== id));
      toast({ title: 'Success', description: 'Server deleted successfully', variant: 'success' });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to delete server';
      toast({ title: 'Error', description: message, variant: 'destructive' });
      throw err;
    }
  }, [toast]);

  const startServer = React.useCallback(async (id: string) => {
    try {
      await api.servers.start(id);
      toast({ title: 'Success', description: 'Server starting...', variant: 'success' });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to start server';
      // If server is already running, refresh state instead of showing error
      if (message.includes('already running')) {
        await refreshServers();
        toast({ title: 'Server Status', description: 'Server is already running', variant: 'default' });
        return;
      }
      toast({ title: 'Error', description: message, variant: 'destructive' });
      throw err;
    }
  }, [toast, refreshServers]);

  const stopServer = React.useCallback(async (id: string) => {
    try {
      await api.servers.stop(id);
      toast({ title: 'Success', description: 'Server stopping...', variant: 'success' });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to stop server';
      // If server is already stopped, refresh state instead of showing error
      if (message.includes('not running')) {
        await refreshServers();
        toast({ title: 'Server Status', description: 'Server is already stopped', variant: 'default' });
        return;
      }
      toast({ title: 'Error', description: message, variant: 'destructive' });
      throw err;
    }
  }, [toast, refreshServers]);

  const restartServer = React.useCallback(async (id: string) => {
    try {
      await api.servers.restart(id);
      toast({ title: 'Success', description: 'Server restarting...', variant: 'success' });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to restart server';
      toast({ title: 'Error', description: message, variant: 'destructive' });
      throw err;
    }
  }, [toast]);

  const initiateUpdate = React.useCallback(async (id: string) => {
    try {
      const result = await api.servers.update.initiate(id);
      toast({ title: 'Update Initiated', description: 'Backup created. You can now update the source files.', variant: 'success' });
      return result;
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to initiate update';
      toast({ title: 'Error', description: message, variant: 'destructive' });
      throw err;
    }
  }, [toast]);

  const applyUpdate = React.useCallback(async (id: string) => {
    try {
      await api.servers.update.apply(id);
      toast({ title: 'Success', description: 'Update applied successfully', variant: 'success' });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to apply update';
      toast({ title: 'Error', description: message, variant: 'destructive' });
      throw err;
    }
  }, [toast]);

  const cancelUpdate = React.useCallback(async (id: string) => {
    try {
      await api.servers.update.cancel(id);
      toast({ title: 'Success', description: 'Update cancelled', variant: 'success' });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to cancel update';
      toast({ title: 'Error', description: message, variant: 'destructive' });
      throw err;
    }
  }, [toast]);

  const acknowledgeCrash = React.useCallback(async (id: string) => {
    try {
      await api.servers.acknowledgeCrash(id);
      toast({ title: 'Crash Acknowledged', description: 'Container logs have been cleaned up', variant: 'default' });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to acknowledge crash';
      toast({ title: 'Error', description: message, variant: 'destructive' });
      throw err;
    }
  }, [toast]);

  const reorderServers = React.useCallback(async (orderedIds: string[]) => {
    const previousOrder = [...servers];
    const lookup = new Map(servers.map(s => [s.id, s]));
    setServers(orderedIds.map(id => lookup.get(id)!).filter(Boolean));

    try {
      await api.servers.reorder(orderedIds);
    } catch (err) {
      setServers(previousOrder);
      const message = err instanceof ApiError ? err.message : 'Failed to reorder servers';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  }, [servers, toast]);

  return (
    <ServerContext.Provider
      value={{
        servers,
        templates,
        loading,
        error,
        refreshServers,
        refreshTemplates,
        importServer,
        editServer,
        deleteServer,
        startServer,
        stopServer,
        restartServer,
        acknowledgeCrash,
        initiateUpdate,
        applyUpdate,
        cancelUpdate,
        reorderServers
      }}
    >
      {children}
    </ServerContext.Provider>
  );
}

export function useServers() {
  const context = React.useContext(ServerContext);
  if (!context) {
    throw new Error('useServers must be used within a ServerProvider');
  }
  return context;
}
