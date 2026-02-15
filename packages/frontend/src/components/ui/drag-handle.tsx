import { GripVertical } from 'lucide-react';
import type { DragHandleProps } from './sortable-grid';

export function DragHandle({ dragHandleProps }: { dragHandleProps: DragHandleProps }) {
  if (!dragHandleProps.listeners) return null;

  return (
    <button
      className="touch-none cursor-grab active:cursor-grabbing p-1 -ml-1 text-muted-foreground hover:text-foreground transition-colors"
      {...dragHandleProps.attributes}
      {...dragHandleProps.listeners}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );
}
