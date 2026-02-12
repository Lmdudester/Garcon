import { useServers } from '@/context/ServerContext';
import { useViewMode } from '@/context/ViewModeContext';
import { ServerCard } from './ServerCard';
import { ImportServerDialog } from './ImportServerDialog';
import { Server } from 'lucide-react';

export function ServerList() {
  const { servers } = useServers();
  const { isAdmin } = useViewMode();

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
    <div>
      <div className="flex items-center gap-4 mb-4">
        <h2 className="text-xl font-semibold shrink-0">Game Servers</h2>
        <div className="h-px flex-1 bg-border" />
        {isAdmin && <div className="shrink-0"><ImportServerDialog /></div>}
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {servers.map((server) => (
          <ServerCard key={server.id} server={server} />
        ))}
      </div>
    </div>
  );
}
