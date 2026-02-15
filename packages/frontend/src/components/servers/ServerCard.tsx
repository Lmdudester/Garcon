import type { ServerResponse } from '@garcon/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ServerStatus } from './ServerStatus';
import { ServerControls } from './ServerControls';
import { ServerInfo } from './ServerInfo';
import { DragHandle } from '@/components/ui/drag-handle';
import type { DragHandleProps } from '@/components/ui/sortable-grid';

interface ServerCardProps {
  server: ServerResponse;
  dragHandleProps?: DragHandleProps;
}

export function ServerCard({ server, dragHandleProps }: ServerCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {dragHandleProps && <DragHandle dragHandleProps={dragHandleProps} />}
          <CardTitle className="text-lg font-medium truncate min-w-0">{server.name}</CardTitle>
        </div>
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
