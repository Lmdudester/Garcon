import type { ServerResponse } from '@garcon/shared';
import { formatUptime, copyToClipboard } from '@/lib/utils';
import { config } from '@/lib/config';
import { useToast } from '@/context/ToastContext';
import { useViewMode } from '@/context/ViewModeContext';
import { Clock, Tag, Copy, FileText, RotateCcw } from 'lucide-react';

interface ServerInfoProps {
  server: ServerResponse;
}

function formatPortDisplay(port: { host: number; protocol: string }): string {
  return `${config.serverHost}:${port.host} (${port.protocol.toUpperCase()})`;
}

function formatPortCopy(port: { host: number }): string {
  return `${config.serverHost}:${port.host}`;
}

export function ServerInfo({ server }: ServerInfoProps) {
  const { toast } = useToast();
  const { isAdmin } = useViewMode();

  // In user view: show only userFacing port, or first port as fallback
  const portsToShow = isAdmin
    ? server.ports
    : server.ports.filter(p => p.userFacing).length > 0
      ? server.ports.filter(p => p.userFacing)
      : server.ports.slice(0, 1);

  const handleCopyPort = (port: { host: number; protocol: string }) => {
    const address = formatPortCopy(port);
    const success = copyToClipboard(address);
    if (success) {
      toast({
        title: 'Copied',
        description: `${address} copied to clipboard`,
        variant: 'default'
      });
    } else {
      toast({
        title: 'Copy failed',
        description: 'Could not copy to clipboard',
        variant: 'destructive'
      });
    }
  };

  return (
    <div className="space-y-2 text-sm text-muted-foreground">
      {server.description && (
        <div className="flex items-start gap-2">
          <FileText className="h-4 w-4 mt-0.5 shrink-0" />
          <span className="line-clamp-2 whitespace-pre-line">{server.description}</span>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Tag className="h-4 w-4" />
        <span>{server.templateName || server.templateId}</span>
      </div>

      {portsToShow.length > 0 && (
        <div className="flex items-center gap-2">
          <Copy className="h-4 w-4 shrink-0" />
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {portsToShow.map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleCopyPort(p);
                }}
                className="text-blue-500 hover:text-blue-700 hover:underline cursor-pointer"
                title="Click to copy address"
              >
                {formatPortDisplay(p)}
              </button>
            ))}
          </div>
        </div>
      )}

      {server.status === 'running' && server.uptime !== undefined && (
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4" />
          <span>Uptime: {formatUptime(server.uptime)}</span>
        </div>
      )}

      {isAdmin && server.restartAfterMaintenance && (
        <div className="flex items-center gap-2">
          <RotateCcw className="h-4 w-4" />
          <span>Auto-restart after maintenance</span>
        </div>
      )}
    </div>
  );
}
