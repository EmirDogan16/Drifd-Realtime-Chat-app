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
import { useState, useTransition, useEffect, useMemo, useRef } from 'react';
import { HeadphoneOff, MicOff, Volume2, Settings } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useModalStore } from '@/hooks/use-modal-store';
import { createClient } from '@/utils/supabase/client';

type Channel = {
  id: string;
  name: string;
  type: 'TEXT' | 'AUDIO' | 'VIDEO';
  position: number;
};

type VoicePresenceUser = {
  profileId: string;
  username: string;
  imageurl: string | null;
  joinedAt: string;
  isMuted?: boolean;
  isDeafened?: boolean;
};

type VoicePresenceRow = {
  channelid: string;
  profileid: string;
  joined_at: string;
  is_muted?: boolean;
  is_deafened?: boolean;
  profiles: {
    username: string;
    imageurl: string | null;
  };
};

type DraggedParticipantPayload = {
  profileId: string;
  fromChannelId: string;
  serverId: string;
};

const PARTICIPANT_DRAG_MIME = 'application/x-drifd-voice-participant';
const PARTICIPANT_DRAG_START_EVENT = 'voice-participant-drag-start';
const PARTICIPANT_DRAG_END_EVENT = 'voice-participant-drag-end';
const VOICE_PARTICIPANT_STATES_EVENT = 'voice-participant-states-updated';

type VoiceParticipantState = {
  profileId: string;
  isMuted: boolean;
  isDeafened: boolean;
};

function isMissingVoiceStateColumnError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const maybeMessage = 'message' in error ? (error as { message?: string }).message : undefined;
  if (!maybeMessage) return false;
  const lower = maybeMessage.toLowerCase();
  return lower.includes('is_muted') || lower.includes('is_deafened') || lower.includes('column');
}

function parseDraggedParticipantPayload(dataTransfer: DataTransfer | null): DraggedParticipantPayload | null {
  if (!dataTransfer) return null;

  const raw = dataTransfer.getData(PARTICIPANT_DRAG_MIME);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<DraggedParticipantPayload>;
    if (!parsed.profileId || !parsed.fromChannelId || !parsed.serverId) return null;
    return {
      profileId: parsed.profileId,
      fromChannelId: parsed.fromChannelId,
      serverId: parsed.serverId,
    };
  } catch {
    return null;
  }
}

function emitParticipantDragStart(payload: DraggedParticipantPayload) {
  window.dispatchEvent(new CustomEvent<DraggedParticipantPayload>(PARTICIPANT_DRAG_START_EVENT, { detail: payload }));
}

function emitParticipantDragEnd() {
  window.dispatchEvent(new Event(PARTICIPANT_DRAG_END_EVENT));
}

function getInitials(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const [first, second] = trimmed.split(/\s+/).filter(Boolean).slice(0, 2);
  return `${first?.[0] ?? ''}${second?.[0] ?? ''}`.toUpperCase() || trimmed[0]?.toUpperCase() || '?';
}

function formatElapsed(seconds: number) {
  const safe = Math.max(0, seconds);
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;

  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

interface SortableVoiceChannelItemProps {
  channel: Channel;
  serverId: string;
  participants: VoicePresenceUser[];
  participantStatesByProfileId: Record<string, VoiceParticipantState>;
  elapsedSeconds: number | null;
  draggingParticipant: { profileId: string; fromChannelId: string } | null;
  dropTargetChannelId: string | null;
  onDropTargetChange: (channelId: string | null) => void;
  onMoveParticipant: (targetChannelId: string, payloadFromDrop?: { profileId: string; fromChannelId: string }) => Promise<void>;
  onStartParticipantDrag: (profileId: string, fromChannelId: string) => void;
  onEndParticipantDrag: () => void;
}

function SortableVoiceChannelItem({
  channel,
  serverId,
  participants,
  participantStatesByProfileId,
  elapsedSeconds,
  draggingParticipant,
  dropTargetChannelId,
  onDropTargetChange,
  onMoveParticipant,
  onStartParticipantDrag,
  onEndParticipantDrag,
}: SortableVoiceChannelItemProps) {
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

  const isDropTarget = dropTargetChannelId === channel.id;

  const handleSettingsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onOpen('channelSettings', {
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
      className="space-y-1"
    >
      <div
        {...attributes}
        {...listeners}
        className={`group flex items-center gap-2 rounded px-2 py-1 text-sm text-drifd-muted transition-colors hover:bg-drifd-hover hover:text-white cursor-grab active:cursor-grabbing ${
          isDropTarget ? 'bg-[#5865f2]/20 ring-1 ring-[#5865f2]/50 text-white' : ''
        }`}
        onClick={(e) => {
          if (!isDragging) {
            router.push(`/servers/${serverId}/channels/${channel.id}`);
          }
        }}
        onDragOver={(e) => {
          const payloadFromDrop = parseDraggedParticipantPayload(e.dataTransfer);
          if (!draggingParticipant && !payloadFromDrop) return;
          e.preventDefault();
          onDropTargetChange(channel.id);
        }}
        onDragLeave={() => {
          onDropTargetChange(null);
        }}
        onDrop={async (e) => {
          const payloadFromDrop = parseDraggedParticipantPayload(e.dataTransfer);
          if (!draggingParticipant && !payloadFromDrop) return;
          e.preventDefault();
          onDropTargetChange(null);
          await onMoveParticipant(channel.id, payloadFromDrop ? {
            profileId: payloadFromDrop.profileId,
            fromChannelId: payloadFromDrop.fromChannelId,
          } : undefined);
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <Volume2 className="h-4 w-4 flex-shrink-0" />
        <span className="flex-1 truncate">{channel.name}</span>
        {elapsedSeconds !== null ? (
          <span className="text-xs font-semibold tabular-nums text-green-400">{formatElapsed(elapsedSeconds)}</span>
        ) : null}
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

      {participants.length > 0 ? (
        <div className="ml-7 space-y-1 pb-1">
          {participants.map((participant) => (
            <button
              type="button"
              key={`${channel.id}-${participant.profileId}`}
              draggable
              onDragStart={(e) => {
                e.stopPropagation();
                e.dataTransfer.effectAllowed = 'move';
                const payload = {
                  profileId: participant.profileId,
                  fromChannelId: channel.id,
                  serverId,
                } satisfies DraggedParticipantPayload;
                e.dataTransfer.setData(
                  PARTICIPANT_DRAG_MIME,
                  JSON.stringify(payload),
                );
                emitParticipantDragStart(payload);
                onStartParticipantDrag(participant.profileId, channel.id);
              }}
              onDragEnd={() => {
                emitParticipantDragEnd();
                onEndParticipantDrag();
                onDropTargetChange(null);
              }}
              onClick={() => router.push(`/servers/${serverId}/channels/${channel.id}`)}
              className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs text-drifd-muted hover:bg-drifd-hover hover:text-white cursor-grab active:cursor-grabbing"
            >
              <div className="h-5 w-5 flex-shrink-0 rounded-full bg-drifd-hover">
                {participant.imageurl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={participant.imageurl}
                    alt={participant.username}
                    className="h-full w-full rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[10px] font-bold text-white">
                    {getInitials(participant.username)}
                  </span>
                )}
              </div>
              <span className="truncate">{participant.username}</span>
              {(() => {
                const state = participantStatesByProfileId[participant.profileId];
                const isDeafened = state ? state.isDeafened : Boolean(participant.isDeafened);
                const isMuted = (state ? state.isMuted : Boolean(participant.isMuted)) || isDeafened;

                if (isDeafened) {
                  return <HeadphoneOff className="ml-auto h-3.5 w-3.5 flex-shrink-0 text-red-400" />;
                }
                if (isMuted) {
                  return <MicOff className="ml-auto h-3.5 w-3.5 flex-shrink-0 text-red-400" />;
                }
                return null;
              })()}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

interface DraggableVoiceChannelListProps {
  channels: Channel[];
  serverId: string;
  categoryId?: string;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export function DraggableVoiceChannelList({
  channels: initialChannels,
  serverId,
  categoryId,
  onDragStart,
  onDragEnd,
}: DraggableVoiceChannelListProps) {
  const [channels, setChannels] = useState(initialChannels);
  const [presenceByChannel, setPresenceByChannel] = useState<Record<string, VoicePresenceUser[]>>({});
  const [presenceStateByProfileId, setPresenceStateByProfileId] = useState<Record<string, VoiceParticipantState>>({});
  const [currentUserProfileId, setCurrentUserProfileId] = useState<string | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const [draggingParticipant, setDraggingParticipant] = useState<{ profileId: string; fromChannelId: string } | null>(null);
  const [dropTargetChannelId, setDropTargetChannelId] = useState<string | null>(null);
  const [participantStatesByProfileId, setParticipantStatesByProfileId] = useState<Record<string, VoiceParticipantState>>({});
  const [isPending, startTransition] = useTransition();
  const supportsVoiceStateColumnsRef = useRef<boolean | null>(null);
  const retryVoiceStateColumnsAfterRef = useRef<number>(0);
  const router = useRouter();

  // Sync state when parent channels change
  useEffect(() => {
    setChannels(initialChannels);
  }, [initialChannels]);

  useEffect(() => {
    const handleGlobalDragStart = (event: Event) => {
      const customEvent = event as CustomEvent<DraggedParticipantPayload>;
      const detail = customEvent.detail;
      if (!detail || detail.serverId !== serverId) return;
      setDraggingParticipant({
        profileId: detail.profileId,
        fromChannelId: detail.fromChannelId,
      });
    };

    const handleGlobalDragEnd = () => {
      setDraggingParticipant(null);
      setDropTargetChannelId(null);
    };

    window.addEventListener(PARTICIPANT_DRAG_START_EVENT, handleGlobalDragStart as EventListener);
    window.addEventListener(PARTICIPANT_DRAG_END_EVENT, handleGlobalDragEnd);

    return () => {
      window.removeEventListener(PARTICIPANT_DRAG_START_EVENT, handleGlobalDragStart as EventListener);
      window.removeEventListener(PARTICIPANT_DRAG_END_EVENT, handleGlobalDragEnd);
    };
  }, [serverId]);

  useEffect(() => {
    const handleParticipantStates = (event: Event) => {
      const customEvent = event as CustomEvent<{ channelId: string; states: VoiceParticipantState[] }>;
      const detail = customEvent.detail;
      if (!detail?.channelId) return;

      setParticipantStatesByProfileId((prev) => {
        const next = { ...prev };

        // Clear previous states that belong to this channel's current participants.
        const channelProfileIds = new Set((presenceByChannel[detail.channelId] || []).map((user) => user.profileId));
        for (const profileId of channelProfileIds) {
          delete next[profileId];
        }

        for (const state of detail.states || []) {
          next[state.profileId] = state;
        }

        return next;
      });
    };

    window.addEventListener(VOICE_PARTICIPANT_STATES_EVENT, handleParticipantStates as EventListener);
    return () => {
      window.removeEventListener(VOICE_PARTICIPANT_STATES_EVENT, handleParticipantStates as EventListener);
    };
  }, [presenceByChannel]);

  useEffect(() => {
    const supabase = createClient();
    let alive = true;

    const loadCurrentUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!alive) return;
      setCurrentUserProfileId(user?.id ?? null);
    };

    void loadCurrentUser();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let alive = true;
    let inFlight = false;

    const loadPresence = async () => {
      if (inFlight) return;
      inFlight = true;
      const activeSince = new Date(Date.now() - 30000).toISOString();
      const db = (supabase as unknown as {
        from: (table: string) => {
          select: (columns: string) => {
            eq: (column: string, value: string) => {
              gte: (column: string, value: string) => Promise<{ data: VoicePresenceRow[] | null; error: unknown }>;
            };
          };
        };
      });

      const fetchLegacyPresence = () => db
        .from('voice_channel_presence')
        .select('channelid, profileid, joined_at, profiles!inner(username, imageurl)')
        .eq('serverid', serverId)
        .gte('last_seen', activeSince);

      let data: VoicePresenceRow[] | null = null;
      let error: unknown = null;

      const shouldSkipModern =
        supportsVoiceStateColumnsRef.current === false
        && Date.now() < retryVoiceStateColumnsAfterRef.current;

      if (shouldSkipModern) {
        const legacy = await fetchLegacyPresence();
        data = legacy.data as VoicePresenceRow[] | null;
        error = legacy.error;
      } else {
        const modern = await db
          .from('voice_channel_presence')
          .select('channelid, profileid, joined_at, is_muted, is_deafened, profiles!inner(username, imageurl)')
          .eq('serverid', serverId)
          .gte('last_seen', activeSince);

        data = modern.data;
        error = modern.error;

        // Backward compatibility: if new columns are missing, switch permanently to legacy query in this session.
        if (error && isMissingVoiceStateColumnError(error)) {
          supportsVoiceStateColumnsRef.current = false;
          retryVoiceStateColumnsAfterRef.current = Date.now() + 30000;
          const legacy = await fetchLegacyPresence();
          data = legacy.data as VoicePresenceRow[] | null;
          error = legacy.error;
        } else if (!error) {
          supportsVoiceStateColumnsRef.current = true;
          retryVoiceStateColumnsAfterRef.current = 0;
        }
      }

      inFlight = false;

      if (!alive) return;
      if (error || !data) {
        setPresenceByChannel({});
        return;
      }

      const grouped: Record<string, VoicePresenceUser[]> = {};
      const stateByProfileId: Record<string, VoiceParticipantState> = {};
      for (const row of data) {
        if (!grouped[row.channelid]) grouped[row.channelid] = [];
        const isDeafened = Boolean(row.is_deafened);
        const isMuted = Boolean(row.is_muted) || isDeafened;
        grouped[row.channelid].push({
          profileId: row.profileid,
          username: row.profiles?.username || 'Unknown',
          imageurl: row.profiles?.imageurl || null,
          joinedAt: row.joined_at,
          isMuted,
          isDeafened,
        });

        stateByProfileId[row.profileid] = {
          profileId: row.profileid,
          isMuted,
          isDeafened,
        };
      }

      for (const key of Object.keys(grouped)) {
        grouped[key].sort((a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime());
      }

      setPresenceByChannel(grouped);
      setPresenceStateByProfileId(stateByProfileId);
    };

    void loadPresence();
    const interval = setInterval(() => {
      void loadPresence();
    }, 2000);

    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [serverId]);

  const hasActiveVoice = useMemo(
    () => Object.values(presenceByChannel).some((list) => list.length > 0),
    [presenceByChannel],
  );

  const combinedParticipantStatesByProfileId = useMemo(() => {
    const next: Record<string, VoiceParticipantState> = { ...presenceStateByProfileId };

    for (const [profileId, state] of Object.entries(participantStatesByProfileId)) {
      const existing = next[profileId];
      if (!existing) {
        next[profileId] = state;
        continue;
      }

      const isDeafened = existing.isDeafened || state.isDeafened;
      const isMuted = existing.isMuted || state.isMuted || isDeafened;

      next[profileId] = {
        profileId,
        isMuted,
        isDeafened,
      };
    }

    return next;
  }, [presenceStateByProfileId, participantStatesByProfileId]);

  useEffect(() => {
    if (!hasActiveVoice) return;
    const interval = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [hasActiveVoice]);

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
          channelType: 'VOICE', // Special type for combined AUDIO+VIDEO
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

  const moveParticipantToChannel = async (
    targetChannelId: string,
    payloadFromDrop?: { profileId: string; fromChannelId: string },
  ) => {
    const movingParticipant = payloadFromDrop ?? draggingParticipant;
    if (!movingParticipant) return;

    if (movingParticipant.fromChannelId === targetChannelId) {
      setDraggingParticipant(null);
      return;
    }

    const response = await fetch('/api/voice/presence/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serverId,
        targetChannelId,
        targetProfileId: movingParticipant.profileId,
      }),
    });

    setDraggingParticipant(null);

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      console.error('[VoiceMove] Failed to move participant:', payload);
      return;
    }

    // Optimistically reflect moved participant in sidebar immediately.
    setPresenceByChannel((prev) => {
      const next: Record<string, VoicePresenceUser[]> = { ...prev };
      const from = [...(next[movingParticipant.fromChannelId] || [])];
      const index = from.findIndex((user) => user.profileId === movingParticipant.profileId);
      if (index === -1) return prev;

      const [movedUser] = from.splice(index, 1);
      next[movingParticipant.fromChannelId] = from;
      next[targetChannelId] = [...(next[targetChannelId] || []), { ...movedUser, joinedAt: new Date().toISOString() }];
      return next;
    });

    window.dispatchEvent(new Event('voice-presence-moved'));

    if (currentUserProfileId && movingParticipant.profileId === currentUserProfileId) {
      router.push(`/servers/${serverId}/channels/${targetChannelId}`);
      return;
    }

    // Refresh voice presence immediately after successful move
    const supabase = createClient();
    const activeSince = new Date(Date.now() - 30000).toISOString();
    const db = (supabase as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (column: string, value: string) => {
            gte: (column: string, value: string) => Promise<{ data: VoicePresenceRow[] | null; error?: unknown }>;
          };
        };
      };
    });

    const fetchLegacyPresence = () => db
      .from('voice_channel_presence')
      .select('channelid, profileid, joined_at, profiles!inner(username, imageurl)')
      .eq('serverid', serverId)
      .gte('last_seen', activeSince);

    let data: VoicePresenceRow[] | null = null;

    const shouldSkipModern =
      supportsVoiceStateColumnsRef.current === false
      && Date.now() < retryVoiceStateColumnsAfterRef.current;

    if (shouldSkipModern) {
      const legacy = await fetchLegacyPresence();
      data = legacy.data as VoicePresenceRow[] | null;
    } else {
      const modern = await db
        .from('voice_channel_presence')
        .select('channelid, profileid, joined_at, is_muted, is_deafened, profiles!inner(username, imageurl)')
        .eq('serverid', serverId)
        .gte('last_seen', activeSince);

      data = modern.data;

      if (modern.error && isMissingVoiceStateColumnError(modern.error)) {
        supportsVoiceStateColumnsRef.current = false;
        retryVoiceStateColumnsAfterRef.current = Date.now() + 30000;
        const legacy = await fetchLegacyPresence();
        data = legacy.data as VoicePresenceRow[] | null;
      } else if (!modern.error) {
        supportsVoiceStateColumnsRef.current = true;
        retryVoiceStateColumnsAfterRef.current = 0;
      }
    }

    const grouped: Record<string, VoicePresenceUser[]> = {};
    const stateByProfileId: Record<string, VoiceParticipantState> = {};
    for (const row of (data || [])) {
      if (!grouped[row.channelid]) grouped[row.channelid] = [];
      const isDeafened = Boolean(row.is_deafened);
      const isMuted = Boolean(row.is_muted) || isDeafened;
      grouped[row.channelid].push({
        profileId: row.profileid,
        username: row.profiles?.username || 'Unknown',
        imageurl: row.profiles?.imageurl || null,
        joinedAt: row.joined_at,
        isMuted,
        isDeafened,
      });

      stateByProfileId[row.profileid] = {
        profileId: row.profileid,
        isMuted,
        isDeafened,
      };
    }

    for (const key of Object.keys(grouped)) {
      grouped[key].sort((a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime());
    }

    setPresenceByChannel(grouped);
    setPresenceStateByProfileId(stateByProfileId);
  };

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
            (() => {
              const participants = presenceByChannel[channel.id] || [];
              const earliestJoined = participants[0]?.joinedAt;
              const elapsedSeconds = earliestJoined
                ? Math.floor((clock - new Date(earliestJoined).getTime()) / 1000)
                : null;

              return (
            <SortableVoiceChannelItem
              key={channel.id}
              channel={channel}
              serverId={serverId}
              participants={participants}
              participantStatesByProfileId={combinedParticipantStatesByProfileId}
              elapsedSeconds={elapsedSeconds}
              draggingParticipant={draggingParticipant}
              dropTargetChannelId={dropTargetChannelId}
              onDropTargetChange={(next) => setDropTargetChannelId(next as string | null)}
              onMoveParticipant={moveParticipantToChannel}
              onStartParticipantDrag={(profileId, fromChannelId) => setDraggingParticipant({ profileId, fromChannelId })}
              onEndParticipantDrag={() => setDraggingParticipant(null)}
            />
              );
            })()
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
