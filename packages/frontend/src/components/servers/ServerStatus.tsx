import type { ServerStatus as ServerStatusType } from '@garcon/shared';

interface ServerStatusProps {
  status: ServerStatusType;
}

const statusConfig: Record<ServerStatusType, { label: string; dotColor: string; animate: boolean; colors: string }> = {
  stopped: { label: 'Offline', dotColor: 'bg-muted-foreground/50', animate: false, colors: 'bg-muted text-muted-foreground' },
  starting: { label: 'Starting', dotColor: 'bg-yellow-500', animate: true, colors: 'bg-yellow-500/15 text-yellow-500' },
  running: { label: 'Live', dotColor: 'bg-red-500', animate: true, colors: 'bg-red-500/15 text-red-500' },
  stopping: { label: 'Stopping', dotColor: 'bg-yellow-500', animate: true, colors: 'bg-yellow-500/15 text-yellow-500' },
  error: { label: 'Crashed', dotColor: 'bg-red-400', animate: false, colors: 'bg-red-400/15 text-red-400' },
  updating: { label: 'Updating', dotColor: 'bg-sky-400', animate: true, colors: 'bg-sky-400/15 text-sky-400' },
};

export function ServerStatus({ status }: ServerStatusProps) {
  const config = statusConfig[status];

  return (
    <span className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${config.colors}`}>
      <span className={`h-2 w-2 rounded-full ${config.dotColor} ${config.animate ? 'animate-pulse' : ''}`} />
      {config.label}
    </span>
  );
}
