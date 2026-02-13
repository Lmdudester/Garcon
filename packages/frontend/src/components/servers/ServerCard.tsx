import type { ServerResponse } from '@garcon/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ServerStatus } from './ServerStatus';
import { ServerControls } from './ServerControls';
import { ServerInfo } from './ServerInfo';

interface ServerCardProps {
  server: ServerResponse;
}

export function ServerCard({ server }: ServerCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg font-medium truncate min-w-0">{server.name}</CardTitle>
        <ServerStatus status={server.status} />
      </CardHeader>
      <CardContent>
        <ServerInfo server={server} />
        <div className="mt-4">
          <ServerControls server={server} />
        </div>
      </CardContent>
    </Card>
  );
}
