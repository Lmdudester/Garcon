import { Loader2 } from 'lucide-react';
import { Header } from './Header';
import { HomePage } from '@/pages/HomePage';
import { useWebSocket } from '@/context/WebSocketContext';

export function MainLayout() {
  const { isConnected } = useWebSocket();

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-6 relative">
        {!isConnected && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-10">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Connecting to server...</span>
            </div>
          </div>
        )}
        <HomePage />
      </main>
    </div>
  );
}
