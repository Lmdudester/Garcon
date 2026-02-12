import { useWebApps } from '@/context/WebAppContext';
import { useViewMode } from '@/context/ViewModeContext';
import { WebAppCard } from './WebAppCard';
import { AddWebAppDialog } from './AddWebAppDialog';

export function WebAppList() {
  const { webApps } = useWebApps();
  const { isAdmin } = useViewMode();

  if (webApps.length === 0 && !isAdmin) {
    return null;
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <h2 className="text-xl font-semibold shrink-0">Web Apps</h2>
        <div className="h-px flex-1 bg-border" />
        {isAdmin && <div className="shrink-0"><AddWebAppDialog /></div>}
      </div>
      {webApps.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {webApps.map((webApp) => (
            <WebAppCard key={webApp.id} webApp={webApp} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No web apps yet. Click "Add Web App" to link a Docker container.
        </p>
      )}
    </div>
  );
}
