import { ToastProvider } from '@/context/ToastContext';
import { ServerProvider } from '@/context/ServerContext';
import { WebSocketProvider } from '@/context/WebSocketContext';
import { ViewModeProvider } from '@/context/ViewModeContext';
import { MainLayout } from '@/components/layout/MainLayout';
import { Toaster } from '@/components/ui/toaster';

function App() {
  return (
    <ToastProvider>
      <WebSocketProvider>
        <ViewModeProvider>
          <ServerProvider>
            <MainLayout />
            <Toaster />
          </ServerProvider>
        </ViewModeProvider>
      </WebSocketProvider>
    </ToastProvider>
  );
}

export default App;
