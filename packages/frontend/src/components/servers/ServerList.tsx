import { useServers } from '@/context/ServerContext';
import { ServerCard } from './ServerCard';
import { Server } from 'lucide-react';

export function ServerList() {
  const { servers } = useServers();

  if (servers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Server className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">No servers yet</h2>
        <p className="text-muted-foreground text-center max-w-md">
          Import a game server to get started. Click the "Add Server" button in the header
          to import a server from your local filesystem.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {servers.map((server) => (
        <ServerCard key={server.id} server={server} />
      ))}
    </div>
  );
}
