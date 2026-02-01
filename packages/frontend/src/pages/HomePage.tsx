import { ServerList } from '@/components/servers/ServerList';
import { ServerCardSkeleton } from '@/components/servers/ServerCardSkeleton';
import { useServers } from '@/context/ServerContext';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw } from 'lucide-react';

export function HomePage() {
  const { loading, error, refreshServers } = useServers();

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <ServerCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <p className="text-lg text-destructive mb-2">{error}</p>
        <p className="text-sm text-muted-foreground mb-4">
          Please check that the backend server is running.
        </p>
        <Button onClick={refreshServers} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  return <ServerList />;
}
