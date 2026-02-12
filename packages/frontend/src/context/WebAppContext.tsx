import * as React from 'react';
import type { WebAppResponse, CreateWebAppRequest, UpdateWebAppRequest } from '@garcon/shared';
import { api, ApiError } from '@/lib/api';
import { useToast } from './ToastContext';

interface WebAppContextValue {
  webApps: WebAppResponse[];
  loading: boolean;
  error: string | null;
  refreshWebApps: () => Promise<void>;
  createWebApp: (data: CreateWebAppRequest) => Promise<WebAppResponse>;
  editWebApp: (id: string, data: UpdateWebAppRequest) => Promise<WebAppResponse>;
  deleteWebApp: (id: string) => Promise<void>;
}

const WebAppContext = React.createContext<WebAppContextValue | undefined>(undefined);

export function WebAppProvider({ children }: { children: React.ReactNode }) {
  const [webApps, setWebApps] = React.useState<WebAppResponse[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const { toast } = useToast();

  const refreshWebApps = React.useCallback(async () => {
    try {
      const data = await api.webApps.list();
      setWebApps(data);
      setError(null);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to load web apps';
      setError(message);
    }
  }, []);

  React.useEffect(() => {
    const load = async () => {
      setLoading(true);
      await refreshWebApps();
      setLoading(false);
    };
    load();
  }, [refreshWebApps]);

  const createWebApp = React.useCallback(async (data: CreateWebAppRequest) => {
    try {
      const webApp = await api.webApps.create(data);
      setWebApps(prev => [...prev, webApp]);
      toast({ title: 'Success', description: 'Web app added successfully', variant: 'success' });
      return webApp;
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to add web app';
      toast({ title: 'Error', description: message, variant: 'destructive' });
      throw err;
    }
  }, [toast]);

  const editWebApp = React.useCallback(async (id: string, data: UpdateWebAppRequest) => {
    try {
      const webApp = await api.webApps.edit(id, data);
      setWebApps(prev => prev.map(a => a.id === id ? webApp : a));
      toast({ title: 'Success', description: 'Web app updated successfully', variant: 'success' });
      return webApp;
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to update web app';
      toast({ title: 'Error', description: message, variant: 'destructive' });
      throw err;
    }
  }, [toast]);

  const deleteWebApp = React.useCallback(async (id: string) => {
    try {
      await api.webApps.delete(id);
      setWebApps(prev => prev.filter(a => a.id !== id));
      toast({ title: 'Success', description: 'Web app removed successfully', variant: 'success' });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to remove web app';
      toast({ title: 'Error', description: message, variant: 'destructive' });
      throw err;
    }
  }, [toast]);

  return (
    <WebAppContext.Provider
      value={{
        webApps,
        loading,
        error,
        refreshWebApps,
        createWebApp,
        editWebApp,
        deleteWebApp,
      }}
    >
      {children}
    </WebAppContext.Provider>
  );
}

export function useWebApps() {
  const context = React.useContext(WebAppContext);
  if (!context) {
    throw new Error('useWebApps must be used within a WebAppProvider');
  }
  return context;
}
