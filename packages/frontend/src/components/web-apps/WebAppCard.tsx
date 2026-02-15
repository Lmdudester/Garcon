import { useState } from 'react';
import { Globe, ExternalLink, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import type { WebAppResponse } from '@garcon/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useViewMode } from '@/context/ViewModeContext';
import { EditWebAppDialog } from './EditWebAppDialog';
import { DeleteWebAppDialog } from './DeleteWebAppDialog';
import { DragHandle } from '@/components/ui/drag-handle';
import type { DragHandleProps } from '@/components/ui/sortable-grid';

interface WebAppCardProps {
  webApp: WebAppResponse;
  dragHandleProps?: DragHandleProps;
}

function getDisplayUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === '/' ? '' : parsed.pathname;
    return parsed.host + path;
  } catch {
    return url;
  }
}

function StatusIndicator({ status }: { status: 'running' | 'stopped' | 'unknown' }) {
  const isLive = status === 'running';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${
      isLive
        ? 'bg-red-500/15 text-red-500'
        : 'bg-muted text-muted-foreground'
    }`}>
      <span className={`h-2 w-2 rounded-full ${
        isLive ? 'bg-red-500 animate-pulse' : 'bg-muted-foreground/50'
      }`} />
      {isLive ? 'Live' : 'Offline'}
    </span>
  );
}

export function WebAppCard({ webApp, dragHandleProps }: WebAppCardProps) {
  const { isAdmin } = useViewMode();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [faviconError, setFaviconError] = useState(false);

  const displayUrl = getDisplayUrl(webApp.url);
  const title = webApp.name || webApp.metadata.title || displayUrl;
  const showSubtitle = webApp.name && webApp.metadata.title && webApp.name !== webApp.metadata.title;
  const description = webApp.description || webApp.metadata.description;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {dragHandleProps && <DragHandle dragHandleProps={dragHandleProps} />}
            {webApp.metadata.faviconUrl && !faviconError ? (
              <img
                src={webApp.metadata.faviconUrl}
                alt=""
                className="h-5 w-5 shrink-0"
                onError={() => setFaviconError(true)}
              />
            ) : (
              <Globe className="h-5 w-5 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0">
              <CardTitle className="text-lg font-medium truncate">{title}</CardTitle>
              {showSubtitle && (
                <p className="text-xs text-muted-foreground truncate">{webApp.metadata.title}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusIndicator status={webApp.containerStatus} />
            {isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setEditOpen(true)}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setDeleteOpen(true)}
                    className="text-red-500"
                  >
                    <Trash2 className="h-4 w-4 mr-2 text-red-500" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {description && (
            <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
              {description}
            </p>
          )}
          <div className="inline-flex items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">Link:</span>
            <a
              href={webApp.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-blue-500 hover:text-blue-700 hover:underline"
            >
              {displayUrl}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </CardContent>
      </Card>

      <EditWebAppDialog webApp={webApp} open={editOpen} onOpenChange={setEditOpen} />
      <DeleteWebAppDialog webApp={webApp} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </>
  );
}
