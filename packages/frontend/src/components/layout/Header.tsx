import { Wifi, WifiOff, Shield, User } from 'lucide-react';
import { useWebSocket } from '@/context/WebSocketContext';
import { useViewMode } from '@/context/ViewModeContext';
import { Button } from '@/components/ui/button';

export function Header() {
  const { isConnected } = useWebSocket();
  const { isAdmin, toggleViewMode } = useViewMode();

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Garcon logo" className="h-10 w-10 sm:h-[3.75rem] sm:w-[3.75rem]" />
          <span className="text-xl sm:text-3xl font-bold">Garçon</span>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {isConnected ? (
              <>
                <Wifi className="h-4 w-4 text-green-500" />
                <span className="hidden sm:inline">Connected</span>
              </>
            ) : (
              <>
                <WifiOff className="h-4 w-4 text-red-500" />
                <span className="hidden sm:inline">Disconnected</span>
              </>
            )}
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={toggleViewMode}
            className={isAdmin ? 'text-amber-500 hover:text-amber-400' : 'text-muted-foreground hover:text-foreground'}
          >
            {isAdmin ? (
              <>
                <Shield className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Admin View</span>
              </>
            ) : (
              <>
                <User className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">User View</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </header>
  );
}
