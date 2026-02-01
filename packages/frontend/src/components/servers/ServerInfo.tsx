import type { ServerResponse } from '@garcon/shared';
import { formatUptime } from '@/lib/utils';
import { config } from '@/lib/config';
import { useToast } from '@/context/ToastContext';
import { Clock, Tag, Copy } from 'lucide-react';

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

  const handleCopyPort = (port: { host: number; protocol: string }) => {
    const address = formatPortCopy(port);
    navigator.clipboard.writeText(address);
    toast({
      title: 'Copied',
      description: `${address} copied to clipboard`,
      variant: 'default'
    });
  };

  return (
    <div className="space-y-2 text-sm text-muted-foreground">
      <div className="flex items-center gap-2">
        <Tag className="h-4 w-4" />
        <span>{server.templateName || server.templateId}</span>
      </div>

      {server.ports.length > 0 && (
        <div className="flex items-center gap-2">
          <Copy className="h-4 w-4" />
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {server.ports.map((p, i) => (
              <button
                key={i}
                onClick={() => handleCopyPort(p)}
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
    </div>
  );
}
