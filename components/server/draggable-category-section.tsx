'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { ReactNode } from 'react';

interface DraggableCategorySectionProps {
  id: string;
  children: ReactNode;
  canDrag?: boolean;
}

export function DraggableCategorySection({ id, children, canDrag = false }: DraggableCategorySectionProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={`mb-4 ${isDragging ? 'opacity-30' : ''}`}
    >
      <div className="relative group/category">
        {canDrag && (
          <div
            {...attributes}
            {...listeners}
            className="absolute left-0 top-0 opacity-0 group-hover/category:opacity-100 transition-opacity cursor-grab active:cursor-grabbing z-20 p-0.5 hover:bg-gray-600/30 rounded"
            title="Kategoriyi sürükle"
          >
            <GripVertical size={13} className="text-gray-500 hover:text-gray-300" />
          </div>
        )}
        <div>
          {children}
        </div>
      </div>
    </div>
  );
}
