import type { ServerStatus as ServerStatusType } from '@garcon/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ServerStatusProps {
  status: ServerStatusType;
}

const statusConfig: Record<ServerStatusType, { label: string; variant: 'default' | 'success' | 'warning' | 'destructive' | 'secondary' }> = {
  stopped: { label: 'Stopped', variant: 'secondary' },
  starting: { label: 'Starting', variant: 'warning' },
  running: { label: 'Running', variant: 'success' },
  stopping: { label: 'Stopping', variant: 'warning' },
  error: { label: 'Crashed', variant: 'destructive' },
  updating: { label: 'Updating', variant: 'warning' }
};

export function ServerStatus({ status }: ServerStatusProps) {
  const config = statusConfig[status];

  return (
    <Badge variant={config.variant} className={cn(
      status === 'starting' || status === 'stopping' || status === 'updating' ? 'animate-pulse' : ''
    )}>
      {config.label}
    </Badge>
  );
}
