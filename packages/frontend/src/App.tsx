import { ToastProvider } from '@/context/ToastContext';
import { ServerProvider } from '@/context/ServerContext';
import { WebSocketProvider } from '@/context/WebSocketContext';
import { MainLayout } from '@/components/layout/MainLayout';
import { Toaster } from '@/components/ui/toaster';

function App() {
  return (
    <ToastProvider>
      <WebSocketProvider>
        <ServerProvider>
          <MainLayout />
          <Toaster />
        </ServerProvider>
      </WebSocketProvider>
    </ToastProvider>
  );
}

export default App;
