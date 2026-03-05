'use client';

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState, useTransition, useEffect } from 'react';
import { Hash, Settings } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useModalStore } from '@/hooks/use-modal-store';

type Channel = {
  id: string;
  name: string;
  type: 'TEXT' | 'AUDIO' | 'VIDEO';
  position: number;
};

interface SortableChannelItemProps {
  channel: Channel;
  serverId: string;
  currentChannelId?: string;
}

function SortableChannelItem({ channel, serverId, currentChannelId }: SortableChannelItemProps) {
  const router = useRouter();
  const { onOpen } = useModalStore();
  const [isHovered, setIsHovered] = useState(false);
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: channel.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isActive = currentChannelId === channel.id;

  const handleSettingsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onOpen('textChannelSettings', {
      channelId: channel.id,
      channelName: channel.name,
      channelType: channel.type,
      serverId,
    });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
        className={`flex items-center gap-2 rounded px-2 py-1 text-sm transition-colors cursor-grab active:cursor-grabbing ${
          isActive
            ? 'bg-drifd-hover text-white'
            : 'text-drifd-muted hover:bg-drifd-hover hover:text-white'
        }`}
        onClick={(e) => {
          if (!isDragging) {
            router.push(`/servers/${serverId}/channels/${channel.id}`);
          }
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <Hash className="h-4 w-4 flex-shrink-0" />
        <span className="flex-1 truncate">{channel.name}</span>
        <button
          onClick={handleSettingsClick}
          className={`flex-shrink-0 rounded p-1 text-drifd-muted hover:bg-drifd-secondary hover:text-white transition-all ${
            isHovered ? 'opacity-100' : 'opacity-0'
          }`}
          title="Kanal Ayarları"
        >
          <Settings className="h-4 w-4" />
        </button>
    </div>
  );
}

interface DraggableChannelListProps {
  channels: Channel[];
  serverId: string;
  channelType: 'TEXT' | 'AUDIO' | 'VIDEO';
  currentChannelId?: string;
  categoryId?: string;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export function DraggableChannelList({
  channels: initialChannels,
  serverId,
  channelType,
  currentChannelId,
  categoryId,
  onDragStart,
  onDragEnd,
}: DraggableChannelListProps) {
  const [channels, setChannels] = useState(initialChannels);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Sync state when parent channels change
  useEffect(() => {
    setChannels(initialChannels);
  }, [initialChannels]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      onDragEnd?.();
      return;
    }

    const oldIndex = channels.findIndex((c) => c.id === active.id);
    const newIndex = channels.findIndex((c) => c.id === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      onDragEnd?.();
      return;
    }

    // Optimistic update
    const reorderedChannels = arrayMove(channels, oldIndex, newIndex);
    setChannels(reorderedChannels);

    // Send update to server
    try {
      const response = await fetch('/api/channels/reorder', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channelId: active.id,
          newPosition: newIndex,
          serverId,
          channelType,
          categoryId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Reorder API failed:', response.status, errorData);
        throw new Error('Failed to update channel order');
      }

      // Dispatch event for other components to refresh
      window.dispatchEvent(new Event('channelReordered'));

      // Refresh the server component data
      startTransition(() => {
        router.refresh();
      });
      
      // Notify parent that drag ended successfully
      onDragEnd?.();
    } catch (error) {
      console.error('Error reordering channels:', error);
      // Revert on error
      setChannels(channels);
      onDragEnd?.();
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={() => onDragStart?.()}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToVerticalAxis]}
    >
      <SortableContext
        items={channels.map((c) => c.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-1">
          {channels.map((channel) => (
            <SortableChannelItem
              key={channel.id}
              channel={channel}
              serverId={serverId}
              currentChannelId={currentChannelId}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
