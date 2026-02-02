import { Wifi, WifiOff } from 'lucide-react';
import { useWebSocket } from '@/context/WebSocketContext';
import { ImportServerDialog } from '@/components/servers/ImportServerDialog';

export function Header() {
  const { isConnected } = useWebSocket();

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Garcon logo" className="h-[3.75rem] w-[3.75rem]" />
          <span className="text-3xl font-bold">Garçon</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {isConnected ? (
              <>
                <Wifi className="h-4 w-4 text-green-500" />
                <span>Connected</span>
              </>
            ) : (
              <>
                <WifiOff className="h-4 w-4 text-red-500" />
                <span>Disconnected</span>
              </>
            )}
          </div>

          <ImportServerDialog />
        </div>
      </div>
    </header>
  );
}
