'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  LiveKitRoom,
  MediaDeviceMenu,
  RoomAudioRenderer,
  VideoTrack,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
  useTracks,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { ConnectionState, RoomEvent, Track } from 'livekit-client';
import { Ban, ChevronDown, Expand, HeadphoneOff, Headphones, LogOut, MessageCircle, Mic, MicOff, Minimize2, MoreVertical, Phone, ScreenShare, ScreenShareOff, UserRound, Video, VideoOff } from 'lucide-react';
import {
  playCallEndSound,
  playCallParticipantJoinSound,
  playCallParticipantLeaveSound,
  playCallStartSound,
  playMuteToggleSound,
  startCallRingSoundLoop,
  stopCallRingSoundLoop,
} from '@/lib/sound-effects';
import { useModalStore } from '@/hooks/use-modal-store';
import { createClient } from '@/utils/supabase/client';

const VOICE_PARTICIPANT_STATES_EVENT = 'voice-participant-states-updated';

type VoiceParticipantState = {
  profileId: string;
  isMuted: boolean;
  isDeafened: boolean;
};

type VoicePresenceStateRow = {
  profileid: string;
  is_muted?: boolean;
  is_deafened?: boolean;
};
import { getLastTextChannelId } from '@/components/navigation/last-text-channel';

type MediaChannelType = 'AUDIO' | 'VIDEO';

interface MediaRoomProps {
  channelId: string;
  channelName: string;
  channelType: MediaChannelType;
  serverId?: string | null;
  enablePresence?: boolean;
  isDMCall?: boolean;
  embedded?: boolean;
  friendAvatarUrl?: string | null;
  currentUserAvatarUrl?: string | null;
  friendProfileId?: string | null;
  currentUserProfileId?: string | null;
  dmCallStartedAtMs?: number | null;
  dmCallerId?: string | null;
  dmCallerName?: string | null;
  dmAutoJoin?: boolean;
  dmDeclinedStandby?: boolean;
  backgroundMode?: boolean;
}

const ACTIVE_SERVER_VOICE_SESSION_KEY = 'drifd-active-server-voice-session';
const ACTIVE_DM_CALL_SESSION_KEY = 'drifd-active-dm-call-session';

type ActiveDMCallSession = {
  channelId: string;
  channelName: string;
  channelType: MediaChannelType;
  friendProfileId: string;
  friendAvatarUrl: string | null;
  currentUserProfileId: string | null;
  currentUserAvatarUrl: string | null;
  shouldAutoJoin: boolean;
  declinedStandby: boolean;
};

function persistServerVoiceSession(channelId: string, channelName: string, channelType: MediaChannelType, serverId?: string | null) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ACTIVE_SERVER_VOICE_SESSION_KEY, JSON.stringify({ channelId, channelName, channelType, serverId: serverId || null }));
    window.dispatchEvent(new CustomEvent('voice-session-updated'));
  } catch {
    // ignore
  }
}

function clearPersistedServerVoiceSession() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(ACTIVE_SERVER_VOICE_SESSION_KEY);
    window.dispatchEvent(new CustomEvent('voice-session-updated'));
  } catch {
    // ignore
  }
}

function persistDMCallSession(session: ActiveDMCallSession) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ACTIVE_DM_CALL_SESSION_KEY, JSON.stringify(session));
    window.dispatchEvent(new CustomEvent('dm-call-session-updated'));
  } catch {
    // ignore
  }
}

function clearPersistedDMCallSession() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(ACTIVE_DM_CALL_SESSION_KEY);
    window.dispatchEvent(new CustomEvent('dm-call-session-updated'));
  } catch {
    // ignore
  }
}

function DMCallHeaderAvatars({
  channelName,
  friendAvatarUrl,
  currentUserAvatarUrl,
  friendProfileId,
  currentUserProfileId,
  hideFriendAvatar,
  pulseCurrentAvatar,
  soloAvatarMode,
}: {
  channelName: string;
  friendAvatarUrl: string | null;
  currentUserAvatarUrl: string | null;
  friendProfileId: string | null;
  currentUserProfileId: string | null;
  hideFriendAvatar: boolean;
  pulseCurrentAvatar: boolean;
  soloAvatarMode: 'none' | 'friend' | 'self';
}) {
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const room = useRoomContext();
  const [isSelfDeafened, setIsSelfDeafened] = useState(false);
  const [deafenedPeerIds, setDeafenedPeerIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const readDeafened = () => {
      try {
        const stored = localStorage.getItem('drifd-voice-settings');
        if (stored) {
          const settings = JSON.parse(stored) as { isDeafened?: boolean };
          setIsSelfDeafened(Boolean(settings.isDeafened));
        }
      } catch { /* ignore */ }
    };
    readDeafened();
    window.addEventListener('voice-settings-changed', readDeafened);
    return () => window.removeEventListener('voice-settings-changed', readDeafened);
  }, []);

  useEffect(() => {
    const handleData = (payload: Uint8Array, participant?: unknown) => {
      try {
        const data = JSON.parse(new TextDecoder().decode(payload)) as { type?: string; isDeafened?: boolean };
        const identity = (participant as { identity?: string } | undefined)?.identity;
        if (data.type === 'drifd-deafen' && identity) {
          setDeafenedPeerIds((prev) => {
            const next = new Set(prev);
            if (data.isDeafened) { next.add(identity); } else { next.delete(identity); }
            return next;
          });
        }
      } catch { /* ignore */ }
    };
    room.on(RoomEvent.DataReceived, handleData);
    return () => { room.off(RoomEvent.DataReceived, handleData); };
  }, [room]);

  const shouldPulse = participants.length < 2;
  const friendParticipant = friendProfileId
    ? participants.find((p: any) => p.identity === friendProfileId)
    : null;
  const isFriendMuted = friendParticipant ? !friendParticipant.isMicrophoneEnabled : false;
  const isFriendDeafened = friendProfileId ? deafenedPeerIds.has(friendProfileId) : false;
  const isSelfMuted = !localParticipant.isMicrophoneEnabled;
  const friendSpeaking = Boolean(
    friendProfileId && participants.find((participant: any) => participant.identity === friendProfileId && participant.isSpeaking),
  );
  const currentSpeaking = Boolean(
    currentUserProfileId && participants.find((participant: any) => participant.identity === currentUserProfileId && participant.isSpeaking),
  );

  const showFriendAvatar =
    soloAvatarMode === 'friend'
      ? true
      : soloAvatarMode === 'self'
        ? false
        : !hideFriendAvatar;
  const showSelfAvatar =
    soloAvatarMode === 'friend'
      ? false
      : Boolean(currentUserAvatarUrl);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center">
      <div className="flex items-center gap-3">
        {showFriendAvatar ? (
          <div className="relative">
          {shouldPulse ? <span className="absolute -inset-1 rounded-full border border-white/40 animate-ping" /> : null}
          <div
            className={`relative h-20 w-20 overflow-hidden rounded-full border bg-drifd-hover transition-all ${
              friendSpeaking ? 'border-green-400 ring-4 ring-green-500/45' : 'border-white/20'
            }`}
          >
            {friendAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={friendAvatarUrl} alt={channelName} className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-2xl font-bold text-white">
                {getInitials(channelName)}
              </span>
            )}
          </div>
          {isFriendDeafened ? (
            <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#1b1d22] bg-[#111214]">
              <HeadphoneOff className="h-3 w-3 text-red-400" />
            </div>
          ) : isFriendMuted ? (
            <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#1b1d22] bg-[#111214]">
              <MicOff className="h-3 w-3 text-red-400" />
            </div>
          ) : null}
          </div>
        ) : null}

        {showSelfAvatar ? (
          <div className="relative">
            {pulseCurrentAvatar ? <span className="absolute -inset-1 rounded-full border border-white/40 animate-ping" /> : null}
            <div
              className={`h-20 w-20 overflow-hidden rounded-full border bg-drifd-hover transition-all ${
                currentSpeaking ? 'border-green-400 ring-4 ring-green-500/45' : 'border-white/20'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={currentUserAvatarUrl ?? ''} alt="Sen" className="h-full w-full object-cover" />
            </div>
            {isSelfDeafened ? (
              <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#1b1d22] bg-[#111214]">
                <HeadphoneOff className="h-3 w-3 text-red-400" />
              </div>
            ) : isSelfMuted ? (
              <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#1b1d22] bg-[#111214]">
                <MicOff className="h-3 w-3 text-red-400" />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface TokenResponse {
  token: string;
  url: string;
}

function getInitials(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '?';

  const [first, second] = trimmed
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  return `${first?.[0] ?? ''}${second?.[0] ?? ''}`.toUpperCase() || trimmed[0]?.toUpperCase() || '?';
}

function tryParseAvatarUrl(metadata: unknown): string | null {
  if (!metadata) return null;
  if (typeof metadata === 'string') {
    try {
      const parsed = JSON.parse(metadata) as { avatarUrl?: unknown };
      if (typeof parsed?.avatarUrl === 'string' && parsed.avatarUrl.trim()) return parsed.avatarUrl;
    } catch {
      // ignore
    }
  }

  return null;
}

function applyParticipantVolume(participant: any, percent: number) {
  const normalized = Math.max(0, Math.min(2, percent / 100));
  try {
    const publications = participant?.audioTrackPublications?.values?.();
    if (!publications) return;

    for (const publication of publications) {
      const track = publication?.audioTrack || publication?.track;
      if (track && typeof track.setVolume === 'function') {
        track.setVolume(normalized);
      }
    }
  } catch {
    // ignore
  }
}

function ParticipantGrid({
  showVideo,
  channelId,
  serverId,
  compact = false,
}: {
  showVideo: boolean;
  channelId: string;
  serverId?: string | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const room = useRoomContext();
  const participants = useParticipants();
  const cameraTracks = useTracks([Track.Source.Camera], { onlySubscribed: true });
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null);
  const [participantVolumes, setParticipantVolumes] = useState<Record<string, number>>({});
  const [serverMuted, setServerMuted] = useState<Record<string, boolean>>({});
  const [serverDeafened, setServerDeafened] = useState<Record<string, boolean>>({});
  const [presenceStateByProfileId, setPresenceStateByProfileId] = useState<Record<string, VoiceParticipantState>>({});
  const [peerDeafenedIds, setPeerDeafenedIds] = useState<Set<string>>(new Set());
  const [selfDeafened, setSelfDeafened] = useState(false);
  const [actionLoadingFor, setActionLoadingFor] = useState<string | null>(null);
  const [actionErrorByParticipant, setActionErrorByParticipant] = useState<Record<string, string | null>>({});
  const [profilePreview, setProfilePreview] = useState<{ id: string; name: string; avatarUrl: string | null } | null>(null);
  const supportsVoiceStateColumnsRef = useRef<boolean | null>(null);

  const getParticipantKey = (participant: any) => participant.sid ?? participant.identity ?? participant.name ?? 'unknown';

  useEffect(() => {
    const readSelfDeafened = () => {
      try {
        const stored = localStorage.getItem('drifd-voice-settings');
        if (!stored) {
          setSelfDeafened(false);
          return;
        }
        const settings = JSON.parse(stored) as { isDeafened?: boolean };
        setSelfDeafened(Boolean(settings.isDeafened));
      } catch {
        setSelfDeafened(false);
      }
    };

    const handleData = (payload: Uint8Array, participant?: unknown) => {
      try {
        const data = JSON.parse(new TextDecoder().decode(payload)) as { type?: string; isDeafened?: boolean };
        const identity = (participant as { identity?: string } | undefined)?.identity;
        if (data.type === 'drifd-deafen' && identity) {
          setPeerDeafenedIds((prev) => {
            const next = new Set(prev);
            if (data.isDeafened) {
              next.add(identity);
            } else {
              next.delete(identity);
            }
            return next;
          });
        }
      } catch {
        // ignore malformed payload
      }
    };

    readSelfDeafened();
    window.addEventListener('voice-settings-changed', readSelfDeafened);
    room.on(RoomEvent.DataReceived, handleData);

    return () => {
      window.removeEventListener('voice-settings-changed', readSelfDeafened);
      room.off(RoomEvent.DataReceived, handleData);
    };
  }, [room]);

  useEffect(() => {
    if (!serverId) {
      setPresenceStateByProfileId({});
      return;
    }

    const supabase = createClient();

    let alive = true;
    let inFlight = false;

    const loadPresenceStates = async () => {
      if (inFlight) return;
      inFlight = true;

      const activeSince = new Date(Date.now() - 30000).toISOString();
      const db = supabase as unknown as {
        from: (table: string) => {
          select: (columns: string) => {
            eq: (column: string, value: string) => {
              gte: (column: string, value: string) => Promise<{ data: VoicePresenceStateRow[] | null; error: unknown }>;
            };
          };
        };
      };

      const fetchLegacy = () => db
        .from('voice_channel_presence')
        .select('profileid')
        .eq('serverid', serverId)
        .gte('last_seen', activeSince);

      let data: VoicePresenceStateRow[] | null = null;
      let error: unknown = null;

      if (supportsVoiceStateColumnsRef.current === false) {
        const legacy = await fetchLegacy();
        data = legacy.data as VoicePresenceStateRow[] | null;
        error = legacy.error;
      } else {
        const modern = await db
          .from('voice_channel_presence')
          .select('profileid, is_muted, is_deafened')
          .eq('serverid', serverId)
          .gte('last_seen', activeSince);

        data = modern.data;
        error = modern.error;

        if (error) {
          supportsVoiceStateColumnsRef.current = false;
          const legacy = await fetchLegacy();
          data = legacy.data as VoicePresenceStateRow[] | null;
          error = legacy.error;
        } else {
          supportsVoiceStateColumnsRef.current = true;
        }
      }

      inFlight = false;

      if (!alive) return;
      if (error || !data) {
        setPresenceStateByProfileId({});
        return;
      }

      const next: Record<string, VoiceParticipantState> = {};
      for (const row of data) {
        const isDeafened = Boolean(row.is_deafened);
        const isMuted = Boolean(row.is_muted) || isDeafened;
        next[row.profileid] = {
          profileId: row.profileid,
          isMuted,
          isDeafened,
        };
      }

      setPresenceStateByProfileId(next);
    };

    void loadPresenceStates();
    const interval = setInterval(() => {
      void loadPresenceStates();
    }, 2000);

    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [serverId]);

  useEffect(() => {
    const localIdentity = room.localParticipant?.identity;
    const states: VoiceParticipantState[] = participants
      .map((participant: any) => {
        const participantKey = getParticipantKey(participant);
        const identity = participant.identity as string | undefined;
        if (!identity) return null;

        const isServerMuted = serverMuted[participantKey] ?? false;
        const isServerDeafened = serverDeafened[participantKey] ?? false;
        const isPeerDeafened = peerDeafenedIds.has(identity);
        const isSelf = identity === localIdentity;
        const presenceState = presenceStateByProfileId[identity];
        const isDeafened = Boolean(presenceState?.isDeafened) || isServerDeafened || isPeerDeafened || (isSelf && selfDeafened);
        const isMuted = isDeafened || Boolean(presenceState?.isMuted) || !participant.isMicrophoneEnabled || isServerMuted;

        return {
          profileId: identity,
          isMuted,
          isDeafened,
        } satisfies VoiceParticipantState;
      })
      .filter((item): item is VoiceParticipantState => item !== null);

    window.dispatchEvent(new CustomEvent<{ channelId: string; states: VoiceParticipantState[] }>(
      VOICE_PARTICIPANT_STATES_EVENT,
      {
        detail: { channelId, states },
      },
    ));

    return () => {
      window.dispatchEvent(new CustomEvent<{ channelId: string; states: VoiceParticipantState[] }>(
        VOICE_PARTICIPANT_STATES_EVENT,
        {
          detail: { channelId, states: [] },
        },
      ));
    };
  }, [participants, room.localParticipant?.identity, serverMuted, serverDeafened, peerDeafenedIds, selfDeafened, channelId, presenceStateByProfileId]);

  useEffect(() => {
    const close = () => setOpenMenuFor(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const applyModerationAction = async (
    participantId: string,
    participantKey: string,
    action: 'server_mute' | 'server_deafen' | 'disconnect',
    enabled = true,
  ) => {
    setActionLoadingFor(participantKey);
    setActionErrorByParticipant((prev) => ({ ...prev, [participantKey]: null }));

    try {
      const response = await fetch('/api/voice/moderation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId,
          targetProfileId: participantId,
          action,
          enabled,
        }),
      });

      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error || 'Moderasyon işlemi başarısız.');
      }

      if (action === 'disconnect') {
        setOpenMenuFor(null);
        return;
      }

      if (action === 'server_mute') {
        setServerMuted((prev) => ({ ...prev, [participantKey]: enabled }));
      }

      if (action === 'server_deafen') {
        setServerDeafened((prev) => ({ ...prev, [participantKey]: enabled }));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Moderasyon işlemi başarısız.';
      setActionErrorByParticipant((prev) => ({ ...prev, [participantKey]: message }));
    } finally {
      setActionLoadingFor(null);
    }
  };

  const blockUser = async (participantId: string, participantKey: string) => {
    setActionLoadingFor(participantKey);
    setActionErrorByParticipant((prev) => ({ ...prev, [participantKey]: null }));

    try {
      const response = await fetch('/api/friends/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetProfileId: participantId }),
      });

      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error || 'Engelleme işlemi başarısız.');
      }

      setOpenMenuFor(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Engelleme işlemi başarısız.';
      setActionErrorByParticipant((prev) => ({ ...prev, [participantKey]: message }));
    } finally {
      setActionLoadingFor(null);
    }
  };

  return (
    <div className={`flex h-full w-full ${compact ? 'items-start justify-stretch p-0' : 'items-center justify-center p-4'}`}>
      <div className={`${compact ? 'flex w-full flex-col gap-3' : 'flex w-full max-w-[1280px] flex-wrap items-center justify-center gap-4'}`}>
      {participants.map((participant) => {
        // LiveKit participant has: name (display name), identity (user ID), metadata (JSON string)
        const displayName = participant.name || participant.identity || 'Unknown';
        const isSpeaking = participant.isSpeaking;
        const avatarUrl = tryParseAvatarUrl(participant.metadata);
        const participantKey = getParticipantKey(participant);
        const volume = participantVolumes[participantKey] ?? 100;
        const isServerMuted = serverMuted[participantKey] ?? false;
        const isServerDeafened = serverDeafened[participantKey] ?? false;
        const isPeerDeafened = participant.identity ? peerDeafenedIds.has(participant.identity) : false;
        const participantId = participant.identity || participant.sid || participantKey;
        const isSelf = participantId === room.localParticipant.identity;
        const presenceState = participant.identity ? presenceStateByProfileId[participant.identity] : undefined;
        const isDeafened = Boolean(presenceState?.isDeafened) || isServerDeafened || isPeerDeafened || (isSelf && selfDeafened);
        const isMicDisabled = isDeafened || Boolean(presenceState?.isMuted) || !participant.isMicrophoneEnabled || isServerMuted;
        const isActionBusy = actionLoadingFor === participantKey;
        const cameraTrackRef = cameraTracks.find((trackRef: any) => {
          const p = trackRef?.participant;
          return p?.identity === participant.identity || p?.sid === participant.sid;
        });
        const key = participantKey;
        const cardClass = compact
          ? `relative flex w-full min-h-[96px] flex-row items-center justify-start gap-3 overflow-visible rounded-xl border p-3 transition-all ${
              isSpeaking ? 'border-green-500 ring-1 ring-green-500/70' : 'border-drifd-divider'
            }`
          : `relative flex aspect-video w-full flex-col items-center justify-center gap-3 overflow-visible rounded-xl border p-4 transition-all sm:w-[calc(50%-0.5rem)] xl:w-[calc(33.333%-0.75rem)] ${
              isSpeaking ? 'border-green-500 ring-2 ring-green-500 ring-offset-2 ring-offset-drifd-tertiary' : 'border-drifd-divider'
            }`;

        return (
          <div
            key={key}
            className={cardClass}
            style={!showVideo || !cameraTrackRef
              ? { background: compact ? '#1f2229' : 'radial-gradient(circle at center, #2f3238 0%, #24262c 60%, #1b1d22 100%)' }
              : undefined}
          >
            {showVideo && cameraTrackRef ? (
              <div className="absolute inset-0 overflow-hidden rounded-[inherit]">
                <VideoTrack trackRef={cameraTrackRef as any} className="h-full w-full object-cover" />
              </div>
            ) : null}

            {!showVideo || !cameraTrackRef ? (
              <div
                className={`flex ${compact ? 'h-14 w-14' : 'h-24 w-24'} items-center justify-center rounded-full transition-all ${
                  isSpeaking ? 'bg-green-500/20 ring-4 ring-green-500' : 'bg-drifd-hover'
                }`}
              >
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt={displayName} className="h-full w-full rounded-full object-cover" />
                ) : (
                  <span className={`${compact ? 'text-base' : 'text-2xl'} font-bold text-white`}>{getInitials(displayName)}</span>
                )}
              </div>
            ) : null}

            <div className={`${compact ? 'ml-auto flex items-end justify-end gap-2' : 'absolute inset-x-3 bottom-3 flex items-end justify-between gap-2'}`}>
              <div className="inline-flex min-w-0 items-center gap-2 rounded-lg border border-white/10 bg-black/75 px-3 py-2 backdrop-blur-sm">
                {isDeafened ? <HeadphoneOff className="h-4 w-4 flex-shrink-0 text-white/90" /> : isMicDisabled ? <MicOff className="h-4 w-4 flex-shrink-0 text-white/90" /> : null}
                <p className="truncate text-sm font-semibold text-white">{displayName}</p>
              </div>

              <div className="relative flex items-center">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenuFor((prev) => (prev === participantKey ? null : participantKey));
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-black/75 text-white/90 backdrop-blur-sm hover:bg-black/85 hover:text-white"
                  title="Seçenekler"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>

                {openMenuFor === participantKey ? (
                  <div
                    className="absolute bottom-full right-0 z-30 mb-2 w-72 rounded-md border border-[#14161b] bg-[#1f2128] p-3 shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="mb-2 flex items-center gap-2 border-b border-white/10 pb-2">
                      <button
                        type="button"
                        onClick={() => setProfilePreview({ id: participantId, name: displayName, avatarUrl })}
                        className="flex flex-1 items-center gap-2 rounded px-2 py-1.5 text-left text-sm font-medium text-white hover:bg-white/10"
                      >
                        <UserRound className="h-4 w-4" />
                        Profili Görüntüle
                      </button>
                    </div>

                    <div className="mb-2 flex items-center gap-2 border-b border-white/10 pb-2">
                      <button
                        type="button"
                        onClick={() => {
                          router.push(`/direct-messages/${encodeURIComponent(participantId)}`);
                          setOpenMenuFor(null);
                        }}
                        className="flex flex-1 items-center gap-2 rounded px-2 py-1.5 text-left text-sm font-medium text-white hover:bg-white/10"
                      >
                        <MessageCircle className="h-4 w-4" />
                        Mesaj Gönder
                      </button>
                    </div>

                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-drifd-muted">Kullanıcı Ses Seviyesi</div>
                    <input
                      type="range"
                      min="0"
                      max="200"
                      value={volume}
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        setParticipantVolumes((prev) => ({ ...prev, [participantKey]: next }));
                        applyParticipantVolume(participant, next);
                      }}
                      className="w-full accent-[#5865f2]"
                    />
                    <div className="mb-2 mt-1 text-right text-xs text-drifd-muted">{volume}%</div>

                    <div className="my-2 h-px bg-white/10" />

                    <button
                      type="button"
                      disabled={isSelf || isActionBusy}
                      onClick={() => blockUser(participantId, participantKey)}
                      className="mb-1 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm font-medium text-red-300 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Ban className="h-4 w-4" />
                      Engelle
                    </button>

                    <button
                      type="button"
                      disabled={isSelf || isActionBusy}
                      onClick={() => void applyModerationAction(participantId, participantKey, 'server_mute', !isServerMuted)}
                      className="mb-1 flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm font-medium text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span>Sunucuda Sustur</span>
                      <span className={`h-5 w-5 rounded border ${isServerMuted ? 'border-green-400 bg-green-500/30' : 'border-white/30 bg-transparent'}`} />
                    </button>

                    <button
                      type="button"
                      disabled={isSelf || isActionBusy}
                      onClick={() => void applyModerationAction(participantId, participantKey, 'server_deafen', !isServerDeafened)}
                      className="mb-1 flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm font-medium text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span>Sunucuda Sağırlaştır</span>
                      <span className={`h-5 w-5 rounded border ${isServerDeafened ? 'border-green-400 bg-green-500/30' : 'border-white/30 bg-transparent'}`} />
                    </button>

                    <button
                      type="button"
                      disabled={isSelf || isActionBusy}
                      onClick={() => void applyModerationAction(participantId, participantKey, 'disconnect', true)}
                      className="mt-1 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm font-medium text-red-300 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <LogOut className="h-4 w-4" />
                      Bağlantıyı Kes
                    </button>

                    {actionErrorByParticipant[participantKey] ? (
                      <p className="mt-2 text-xs text-red-300">{actionErrorByParticipant[participantKey]}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
      </div>

      {profilePreview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setProfilePreview(null)}>
          <div className="w-full max-w-sm rounded-xl border border-[#15171d] bg-[#1b1d24] p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-3">
              {profilePreview.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profilePreview.avatarUrl} alt={profilePreview.name} className="h-14 w-14 rounded-full object-cover" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-drifd-hover text-lg font-bold text-white">
                  {getInitials(profilePreview.name)}
                </div>
              )}
              <div>
                <p className="text-base font-bold text-white">{profilePreview.name}</p>
                <p className="text-xs text-drifd-muted">ID: {profilePreview.id}</p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  router.push(`/direct-messages/${encodeURIComponent(profilePreview.id)}`);
                  setProfilePreview(null);
                }}
                className="flex-1 rounded-md bg-[#2f3340] px-3 py-2 text-sm font-semibold text-white hover:bg-[#3a3f4e]"
              >
                Mesaj Gönder
              </button>
              <button
                type="button"
                onClick={() => setProfilePreview(null)}
                className="rounded-md border border-white/20 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function VoiceStreamingLayout({ channelId, serverId }: { channelId: string; serverId?: string | null }) {
  const screenShareTracks = useTracks([Track.Source.ScreenShare], { onlySubscribed: true });
  const [activeShareParticipantId, setActiveShareParticipantId] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [isStageFullscreen, setIsStageFullscreen] = useState(false);

  useEffect(() => {
    if (!screenShareTracks.length) {
      setActiveShareParticipantId(null);
      return;
    }

    const hasActive = activeShareParticipantId
      ? screenShareTracks.some((track: any) => track.participant?.identity === activeShareParticipantId)
      : false;

    if (!hasActive) {
      setActiveShareParticipantId(screenShareTracks[0]?.participant?.identity || null);
    }
  }, [screenShareTracks, activeShareParticipantId]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsStageFullscreen(document.fullscreenElement === stageRef.current);
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const screenShareTrack = screenShareTracks.find((track: any) => track.participant?.identity === activeShareParticipantId) || screenShareTracks[0];

  if (!screenShareTrack) {
    return <ParticipantGrid showVideo={false} channelId={channelId} serverId={serverId} />;
  }

  const sharerName = screenShareTrack.participant.name || screenShareTrack.participant.identity || 'Unknown';

  const toggleStageFullscreen = async () => {
    const stage = stageRef.current;
    if (!stage) return;

    try {
      if (document.fullscreenElement === stage) {
        await document.exitFullscreen();
      } else {
        await stage.requestFullscreen();
      }
    } catch {
      // ignore browser fullscreen permission errors
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 lg:flex-row">
      <div
        ref={stageRef}
        className="min-h-[320px] flex-1 overflow-hidden rounded-xl border border-drifd-divider bg-black"
        onDoubleClick={() => {
          void toggleStageFullscreen();
        }}
      >
        <div className="relative h-full w-full">
          <VideoTrack trackRef={screenShareTrack} className="h-full w-full object-contain" />
          <button
            type="button"
            onClick={() => {
              void toggleStageFullscreen();
            }}
            className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/20 bg-black/60 text-white hover:bg-black/80"
            title={isStageFullscreen ? 'Tam ekrandan cik' : 'Tam ekran'}
          >
            {isStageFullscreen ? <Minimize2 className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
          </button>
          <div className="absolute bottom-3 left-3 rounded-md bg-drifd-tertiary/80 px-2 py-1 text-xs font-semibold text-white">
            {sharerName} yayında
          </div>
        </div>
      </div>

      <div className="max-h-[40vh] overflow-y-auto lg:max-h-none lg:w-[380px] xl:w-[420px]">
        {screenShareTracks.length > 1 ? (
          <div className="mb-3 rounded-xl border border-drifd-divider bg-[#14161b] p-2">
            <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-drifd-muted">Yayınlar</p>
            <div className="flex flex-col gap-2">
              {screenShareTracks.map((track: any) => {
                const participantId = track.participant?.identity || 'unknown';
                const participantName = track.participant?.name || participantId;
                const isActive = participantId === (screenShareTrack.participant?.identity || null);

                return (
                  <button
                    key={`${participantId}-screen`}
                    type="button"
                    onClick={() => setActiveShareParticipantId(participantId)}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                      isActive
                        ? 'border-[#6f58f2] bg-[#2a2540] text-white'
                        : 'border-white/10 bg-[#1f2229] text-drifd-muted hover:border-white/20 hover:text-white'
                    }`}
                  >
                    {participantName}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        <ParticipantGrid showVideo={false} channelId={channelId} serverId={serverId} compact={true} />
      </div>
    </div>
  );
}

function VideoParticipantLayout({ channelId, serverId }: { channelId: string; serverId?: string | null }) {
  const screenShareTracks = useTracks([Track.Source.ScreenShare], { onlySubscribed: true });
  const [activeShareParticipantId, setActiveShareParticipantId] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [isStageFullscreen, setIsStageFullscreen] = useState(false);

  useEffect(() => {
    if (!screenShareTracks.length) {
      setActiveShareParticipantId(null);
      return;
    }

    const hasActive = activeShareParticipantId
      ? screenShareTracks.some((track: any) => track.participant?.identity === activeShareParticipantId)
      : false;

    if (!hasActive) {
      setActiveShareParticipantId(screenShareTracks[0]?.participant?.identity || null);
    }
  }, [screenShareTracks, activeShareParticipantId]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsStageFullscreen(document.fullscreenElement === stageRef.current);
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const screenShareTrack = screenShareTracks.find((track: any) => track.participant?.identity === activeShareParticipantId) || screenShareTracks[0];

  if (screenShareTrack) {
    const sharerName = screenShareTrack.participant.name || screenShareTrack.participant.identity || 'Unknown';

    const toggleStageFullscreen = async () => {
      const stage = stageRef.current;
      if (!stage) return;

      try {
        if (document.fullscreenElement === stage) {
          await document.exitFullscreen();
        } else {
          await stage.requestFullscreen();
        }
      } catch {
        // ignore browser fullscreen permission errors
      }
    };

    return (
      <div className="flex h-full flex-col gap-4 p-4">
        <div
          ref={stageRef}
          className="min-h-[240px] overflow-hidden rounded-xl border border-drifd-divider bg-black"
          onDoubleClick={() => {
            void toggleStageFullscreen();
          }}
        >
          <div className="relative h-full w-full">
            <VideoTrack trackRef={screenShareTrack} className="h-full w-full object-contain" />
            <button
              type="button"
              onClick={() => {
                void toggleStageFullscreen();
              }}
              className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/20 bg-black/60 text-white hover:bg-black/80"
              title={isStageFullscreen ? 'Tam ekrandan cik' : 'Tam ekran'}
            >
              {isStageFullscreen ? <Minimize2 className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
            </button>
            <div className="absolute bottom-3 left-3 rounded-md bg-drifd-tertiary/80 px-2 py-1 text-xs font-semibold text-white">
              {sharerName} ekran paylaşıyor
            </div>
          </div>
        </div>
        {screenShareTracks.length > 1 ? (
          <div className="rounded-xl border border-drifd-divider bg-[#14161b] p-2">
            <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-drifd-muted">Yayınlar</p>
            <div className="flex flex-wrap gap-2">
              {screenShareTracks.map((track: any) => {
                const participantId = track.participant?.identity || 'unknown';
                const participantName = track.participant?.name || participantId;
                const isActive = participantId === (screenShareTrack.participant?.identity || null);

                return (
                  <button
                    key={`${participantId}-screen-video`}
                    type="button"
                    onClick={() => setActiveShareParticipantId(participantId)}
                    className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                      isActive
                        ? 'border-[#6f58f2] bg-[#2a2540] text-white'
                        : 'border-white/10 bg-[#1f2229] text-drifd-muted hover:border-white/20 hover:text-white'
                    }`}
                  >
                    {participantName}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ParticipantGrid showVideo={true} channelId={channelId} serverId={serverId} />
        </div>
      </div>
    );
  }

  return <ParticipantGrid showVideo={true} channelId={channelId} serverId={serverId} />;
}

/** Applies output volume from voice settings to all <audio> elements rendered by LiveKit */
function OutputVolumeController() {
  useEffect(() => {
    const applyVolume = () => {
      try {
        const stored = localStorage.getItem('drifd-voice-settings');
        if (!stored) return;
        const settings = JSON.parse(stored);
        const vol = settings.isDeafened
          ? 0
          : (typeof settings.outputVolume === 'number' ? settings.outputVolume / 100 : 1);
        // LiveKit renders <audio> elements for remote participants
        document.querySelectorAll('audio').forEach(el => {
          el.volume = Math.max(0, Math.min(1, vol));
        });
      } catch { /* ignore */ }
    };

    applyVolume();

    // Re-apply when settings change
    const handler = () => applyVolume();
    window.addEventListener('voice-settings-changed', handler);

    // Also periodically apply in case new audio elements are created
    const interval = setInterval(applyVolume, 1000);

    return () => {
      window.removeEventListener('voice-settings-changed', handler);
      clearInterval(interval);
    };
  }, []);

  return null;
}

function CallSoundEffects({ isConnected }: { isConnected: boolean }) {
  const participants = useParticipants();
  const previousCountRef = useRef(0);

  useEffect(() => {
    if (!isConnected) return;

    const currentCount = participants.length;
    if (previousCountRef.current !== 0) {
      if (currentCount > previousCountRef.current) {
        playCallParticipantJoinSound();
      }

      if (currentCount < previousCountRef.current) {
        playCallParticipantLeaveSound();
      }
    }

    previousCountRef.current = currentCount;
  }, [isConnected, participants.length]);

  return null;
}

function DMOtherParticipantCountBridge({ onChange }: { onChange: (count: number) => void }) {
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();

  useEffect(() => {
    const localIdentity = localParticipant?.identity;
    const others = participants.filter((participant: any) => participant.identity !== localIdentity);
    onChange(others.length);
  }, [participants, localParticipant?.identity, onChange]);

  return null;
}

function DiscordControlBar({
  showCamera,
  onLeave,
  menuDirection = 'up',
}: {
  showCamera: boolean;
  onLeave: () => void;
  menuDirection?: 'up' | 'down';
}) {
  const room = useRoomContext();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } = useLocalParticipant();
  const { onOpen } = useModalStore();
  const [busy, setBusy] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const leavingRef = useRef(false);
  const lastPublishedDeafenRef = useRef<boolean | null>(null);
  const micGainProcessorRef = useRef<{
    setVolume: (value: number) => void;
    destroy: () => Promise<void>;
  } | null>(null);
  const micGainTrackIdRef = useRef<string | null>(null);

  const isRoomOperational = useCallback(() => {
    if (leavingRef.current) return false;
    return room.state === ConnectionState.Connected;
  }, [room]);

  // Apply stored voice settings on mount and listen for changes
  useEffect(() => {
    const createMicGainProcessor = (initialVolume: number) => {
      let source: MediaStreamAudioSourceNode | null = null;
      let gain: GainNode | null = null;
      let destination: MediaStreamAudioDestinationNode | null = null;
      let fallbackContext: AudioContext | null = null;
      let current = initialVolume;

      const getContext = (provided?: AudioContext) => {
        if (provided && typeof provided.createMediaStreamSource === 'function') {
          return provided;
        }

        if (fallbackContext) return fallbackContext;

        const Ctor =
          typeof window !== 'undefined'
            ? ((window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ||
               (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
            : undefined;

        if (!Ctor) return null;

        fallbackContext = new Ctor();
        return fallbackContext;
      };

      const cleanup = () => {
        try {
          source?.disconnect();
          gain?.disconnect();
        } catch {
          // ignore
        }
        source = null;
        gain = null;
        destination = null;
      };

      const processor: {
        name: string;
        processedTrack?: MediaStreamTrack;
        init: (opts: { track: MediaStreamTrack; audioContext?: AudioContext }) => Promise<void>;
        restart: (opts: { track: MediaStreamTrack; audioContext?: AudioContext }) => Promise<void>;
        destroy: () => Promise<void>;
        setVolume: (value: number) => void;
      } = {
        name: 'drifd-mic-gain',
        processedTrack: undefined,
        init: async ({ track, audioContext }) => {
          cleanup();
          const context = getContext(audioContext);
          if (!context) {
            // Fallback to unprocessed track if audio context is unavailable.
            processor.processedTrack = track;
            return;
          }
          source = context.createMediaStreamSource(new MediaStream([track]));
          gain = context.createGain();
          gain.gain.value = current;
          destination = context.createMediaStreamDestination();
          source.connect(gain);
          gain.connect(destination);
          processor.processedTrack = destination.stream.getAudioTracks()[0];
        },
        restart: async ({ track, audioContext }) => {
          await processor.init({ track, audioContext });
        },
        destroy: async () => {
          cleanup();
          if (fallbackContext) {
            await fallbackContext.close().catch(() => {});
            fallbackContext = null;
          }
        },
        setVolume: (value: number) => {
          current = value;
          if (gain) {
            gain.gain.value = value;
          }
        },
      };

      return processor;
    };

    const applyInputVolume = async (inputVolume?: number, retry = 0) => {
      const publication = localParticipant.getTrackPublication(Track.Source.Microphone);
      const localAudioTrack = publication?.audioTrack;

      if (!localAudioTrack) {
        if (retry < 5) {
          setTimeout(() => {
            void applyInputVolume(inputVolume, retry + 1);
          }, 200);
        }
        return;
      }

      const normalized = typeof inputVolume === 'number'
        ? Math.max(0, Math.min(1, inputVolume / 100))
        : 1;

      try {
        const currentTrackId = localAudioTrack.mediaStreamTrack.id;

        if (!micGainProcessorRef.current || micGainTrackIdRef.current !== currentTrackId) {
          if (micGainProcessorRef.current) {
            await micGainProcessorRef.current.destroy().catch(() => {});
          }

          const processor = createMicGainProcessor(normalized);
          await localAudioTrack.setProcessor(processor as unknown as never);
          micGainProcessorRef.current = processor;
          micGainTrackIdRef.current = currentTrackId;
        }

        micGainProcessorRef.current.setVolume(normalized);
      } catch {
        // If processor setup fails, keep default behavior.
      }
    };

    const applyVoiceSettings = async () => {
      if (typeof window === 'undefined') return;
      
      try {
        const stored = localStorage.getItem('drifd-voice-settings');
        if (stored) {
          const settings = JSON.parse(stored) as {
            isMuted: boolean;
            isDeafened: boolean;
            selectedInputDevice?: string;
            inputVolume?: number;
            selectedOutputDevice?: string;
            outputVolume?: number;
          };
          
          // Apply mute state if different from current
          if (isRoomOperational() && settings.isMuted !== !isMicrophoneEnabled) {
            await localParticipant.setMicrophoneEnabled(!settings.isMuted);
          }

          // Apply selected input device
          if (isRoomOperational() && settings.selectedInputDevice) {
            try {
              await room.switchActiveDevice('audioinput', settings.selectedInputDevice);
            } catch { /* device might not be available */ }
          }

          // Apply outgoing microphone input gain when supported by browser.
          await applyInputVolume(settings.inputVolume);

          // Apply selected output device
          if (isRoomOperational() && settings.selectedOutputDevice) {
            try {
              await room.switchActiveDevice('audiooutput', settings.selectedOutputDevice);
            } catch { /* device might not be available */ }
          }

          setIsDeafened(Boolean(settings.isDeafened));
        }
      } catch {
        // ignore
      }
    };

    // Apply settings when the room is fully connected to avoid publish/unpublish races.
    const handleRoomConnected = () => {
      void applyVoiceSettings();
    };

    if (isRoomOperational()) {
      void applyVoiceSettings();
    }

    room.on(RoomEvent.Connected, handleRoomConnected);

    // Listen for changes from UserVoicePanel
    const handleVoiceSettingsChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{
        isMuted: boolean;
        isDeafened: boolean;
        selectedInputDevice?: string;
        inputVolume?: number;
        selectedOutputDevice?: string;
        outputVolume?: number;
      }>;
      if (customEvent.detail) {
        if (!isRoomOperational()) return;

        void localParticipant.setMicrophoneEnabled(!customEvent.detail.isMuted);
        const nextDeafened = Boolean(customEvent.detail.isDeafened);
        setIsDeafened(nextDeafened);

        // Propagate deafen changes coming from sidebar controls to other participants.
        if (lastPublishedDeafenRef.current !== nextDeafened) {
          lastPublishedDeafenRef.current = nextDeafened;
          try {
            const payload = JSON.stringify({ type: 'drifd-deafen', isDeafened: nextDeafened });
            void localParticipant.publishData(new TextEncoder().encode(payload), { reliable: true });
          } catch {
            // ignore — data broadcast is best-effort
          }
        }

        // Switch input device if changed
        if (typeof customEvent.detail.selectedInputDevice === 'string') {
          room.switchActiveDevice('audioinput', customEvent.detail.selectedInputDevice || 'default').catch(() => {});
        }

        // Apply incoming inputVolume changes to outgoing mic track (best-effort).
        if (typeof customEvent.detail.inputVolume === 'number') {
          void applyInputVolume(customEvent.detail.inputVolume);
        }

        // Switch output device if changed
        if (typeof customEvent.detail.selectedOutputDevice === 'string') {
          room.switchActiveDevice('audiooutput', customEvent.detail.selectedOutputDevice || 'default').catch(() => {});
        }
      }
    };

    window.addEventListener('voice-settings-changed', handleVoiceSettingsChanged);

    return () => {
      room.off(RoomEvent.Connected, handleRoomConnected);
      window.removeEventListener('voice-settings-changed', handleVoiceSettingsChanged);
      if (micGainProcessorRef.current) {
        void micGainProcessorRef.current.destroy();
        micGainProcessorRef.current = null;
        micGainTrackIdRef.current = null;
      }
    };
  }, [localParticipant, isMicrophoneEnabled, room, isRoomOperational]);

  const toggleMicrophone = async () => {
    if (busy) return;
    if (!isRoomOperational()) return;
    setBusy(true);
    try {
      const newState = !isMicrophoneEnabled;
      await localParticipant.setMicrophoneEnabled(newState);
      playMuteToggleSound(newState ? 'unmute' : 'mute');
      
      // Update stored settings
      try {
        const stored = localStorage.getItem('drifd-voice-settings');
        const settings = stored ? JSON.parse(stored) : { isMuted: false, isDeafened: false };
        settings.isMuted = !newState;
        localStorage.setItem('drifd-voice-settings', JSON.stringify(settings));
        window.dispatchEvent(new CustomEvent('voice-settings-changed', { detail: settings }));
      } catch {
        // ignore
      }
    } finally {
      setBusy(false);
    }
  };

  const toggleCamera = async () => {
    if (busy) return;
    if (!isRoomOperational()) return;
    setBusy(true);
    try {
      await localParticipant.setCameraEnabled(!isCameraEnabled);
    } finally {
      setBusy(false);
    }
  };

  const toggleDeafen = () => {
    if (!isRoomOperational()) return;
    try {
      const stored = localStorage.getItem('drifd-voice-settings');
      const settings = stored
        ? JSON.parse(stored)
        : {
            isMuted: false,
            isDeafened: false,
            selectedInputDevice: '',
            selectedOutputDevice: '',
            inputVolume: 75,
            outputVolume: 75,
          };

      const nextDeaf = !Boolean(settings.isDeafened);
      settings.isDeafened = nextDeaf;
      if (nextDeaf) {
        settings.isMuted = true;
      }

      localStorage.setItem('drifd-voice-settings', JSON.stringify(settings));
      window.dispatchEvent(new CustomEvent('voice-settings-changed', { detail: settings }));
      setIsDeafened(nextDeaf);
      if (nextDeaf && isRoomOperational()) {
        void localParticipant.setMicrophoneEnabled(false);
      }

      // Broadcast deafen state to other participants via LiveKit data channel
      try {
        if (!isRoomOperational()) return;
        lastPublishedDeafenRef.current = nextDeaf;
        const payload = JSON.stringify({ type: 'drifd-deafen', isDeafened: nextDeaf });
        void localParticipant.publishData(new TextEncoder().encode(payload), { reliable: true });
      } catch {
        // ignore — data broadcast is best-effort
      }
    } catch {
      // ignore
    }
  };

  const toggleScreenShare = async () => {
    if (busy) return;
    if (!isRoomOperational()) return;
    setBusy(true);
    try {
      await localParticipant.setScreenShareEnabled(!isScreenShareEnabled);
    } finally {
      setBusy(false);
    }
  };

  const leave = () => {
    leavingRef.current = true;
    stopCallRingSoundLoop();
    playCallEndSound();
    room.disconnect();
    onLeave();
  };

  return (
    <div className={`voice-menu-${menuDirection} flex h-14 w-full items-center justify-center overflow-visible px-2`}>
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#111318]/96 px-2 py-1.5 shadow-2xl backdrop-blur-sm">
        <div className="relative flex overflow-visible rounded-md border border-white/10">
          <button
            type="button"
            onClick={toggleMicrophone}
            disabled={busy}
            className={`flex h-9 w-10 items-center justify-center rounded-l-md transition-colors disabled:opacity-60 ${
              !isMicrophoneEnabled
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-drifd-hover text-drifd-muted hover:bg-drifd-secondary hover:text-white'
            }`}
            title={!isMicrophoneEnabled ? 'Sesi Aç' : 'Sessize Al'}
          >
            {!isMicrophoneEnabled ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
          <MediaDeviceMenu
            kind="audioinput"
            className={`flex h-9 w-7 items-center justify-center rounded-r-md border-l border-white/10 transition-colors ${
              !isMicrophoneEnabled
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-drifd-hover text-drifd-muted hover:bg-drifd-secondary hover:text-white'
            }`}
          >
            <ChevronDown className="h-3 w-3" />
          </MediaDeviceMenu>
        </div>

        <div className="relative flex overflow-visible rounded-md border border-white/10">
          <button
            type="button"
            onClick={toggleDeafen}
            className={`flex h-9 w-10 items-center justify-center rounded-l-md transition-colors ${
              isDeafened
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-drifd-hover text-drifd-muted hover:bg-drifd-secondary hover:text-white'
            }`}
            title="Sağırlaştır"
          >
            <Headphones className="h-4 w-4" />
          </button>
          <MediaDeviceMenu
            kind="audiooutput"
            className={`flex h-9 w-7 items-center justify-center rounded-r-md border-l border-white/10 transition-colors ${
              isDeafened
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-drifd-hover text-drifd-muted hover:bg-drifd-secondary hover:text-white'
            }`}
          >
            <ChevronDown className="h-3 w-3" />
          </MediaDeviceMenu>
        </div>

        {showCamera ? (
          <button
            type="button"
            onClick={toggleCamera}
            disabled={busy}
            className={`flex h-9 w-9 items-center justify-center rounded-md border border-white/10 transition-colors disabled:opacity-60 ${
              isCameraEnabled
                ? 'bg-drifd-hover text-drifd-muted hover:bg-drifd-secondary hover:text-white'
                : 'bg-red-600 text-white hover:bg-red-700'
            }`}
            title={isCameraEnabled ? 'Kamerayı Kapat' : 'Kamerayı Aç'}
          >
            {isCameraEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
          </button>
        ) : null}

        <button
          type="button"
          onClick={toggleScreenShare}
          disabled={busy}
          className={`flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 transition-colors disabled:opacity-60 ${
            isScreenShareEnabled
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'bg-drifd-hover text-drifd-muted hover:bg-drifd-secondary hover:text-white'
          }`}
          title={isScreenShareEnabled ? 'Paylaşımı Durdur' : 'Ekran Paylaş'}
        >
          {isScreenShareEnabled ? <ScreenShareOff className="h-4 w-4" /> : <ScreenShare className="h-4 w-4" />}
        </button>

        <button
          type="button"
          onClick={leave}
          className="flex h-9 w-10 items-center justify-center rounded-md bg-red-600 text-white transition-colors hover:bg-red-700"
          title="Ayrıl"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function MediaRoom({
  channelId,
  channelName,
  channelType,
  serverId = null,
  enablePresence = true,
  isDMCall = false,
  embedded = false,
  friendAvatarUrl = null,
  currentUserAvatarUrl = null,
  friendProfileId = null,
  currentUserProfileId = null,
  dmCallStartedAtMs = null,
  dmCallerId = null,
  dmCallerName = null,
  dmAutoJoin = false,
  dmDeclinedStandby = false,
  backgroundMode = false,
}: MediaRoomProps) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveChannelName, setLiveChannelName] = useState(channelName);
  const [isConnected, setIsConnected] = useState(
    isDMCall
      ? Boolean(
          (dmCallerId && currentUserProfileId && dmCallerId === currentUserProfileId)
          || dmAutoJoin,
        )
      : true,
  );
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [otherParticipantCount, setOtherParticipantCount] = useState(0);
  const [remainingAloneSinceMs, setRemainingAloneSinceMs] = useState<number | null>(null);
  const [manualDisconnectStartedAtMs, setManualDisconnectStartedAtMs] = useState<number | null>(null);
  const [declinedStandby, setDeclinedStandby] = useState(Boolean(dmDeclinedStandby));
  const wasConnectedRef = useRef(false);
  const autoEndedRef = useRef(false);
  const incomingTimedOutRef = useRef(false);
  const hadPeerConnectedRef = useRef(false);
  const remainingAutoClosedRef = useRef(false);
  const manualDisconnectAutoClosedRef = useRef(false);
  const emptyRoomAutoClosedRef = useRef(false);
  const incomingScreenOpenedAtRef = useRef(Date.now());
  const leavingRoomRef = useRef(false);

  const callStartedAt = dmCallStartedAtMs ?? Date.now();
  const elapsedMs = Math.max(0, nowMs - callStartedAt);
  const incomingScreenElapsedMs = Math.max(0, nowMs - incomingScreenOpenedAtRef.current);
  const manualDisconnectElapsedMs = manualDisconnectStartedAtMs
    ? Math.max(0, nowMs - manualDisconnectStartedAtMs)
    : 0;
  const isManualDisconnectedHold = Boolean(isDMCall && !isConnected && manualDisconnectStartedAtMs !== null);
  const isCallerWaiting = Boolean(
    isDMCall
    && dmCallerId
    && currentUserProfileId
    && dmCallerId === currentUserProfileId,
  );
  const isIncomingReceiver = Boolean(isDMCall && !isCallerWaiting);
  const hideFriendAvatar = Boolean(
    isCallerWaiting
    && elapsedMs >= 30_000
    && otherParticipantCount === 0
    && !hadPeerConnectedRef.current,
  );
  const shouldPulseCurrentAvatar = Boolean(
    isDMCall
    && isConnected
    && otherParticipantCount === 0
    && !friendAvatarUrl,
  );
  const baseSoloAvatarMode: 'none' | 'friend' | 'self' = isManualDisconnectedHold
    ? 'friend'
    : (isDMCall && isConnected && hadPeerConnectedRef.current && otherParticipantCount === 0 ? 'self' : 'none');
  const showDMRejoinStandby = Boolean(
    isDMCall
    && !isConnected
    && (declinedStandby || isManualDisconnectedHold || (isIncomingReceiver && incomingScreenElapsedMs < 90_000)),
  );
  const soloAvatarMode: 'none' | 'friend' | 'self' = showDMRejoinStandby ? 'friend' : baseSoloAvatarMode;

  const handleLeave = useCallback(() => {
    if (leavingRoomRef.current) return;
    leavingRoomRef.current = true;

    if (!isDMCall) {
      clearPersistedServerVoiceSession();
    } else {
      clearPersistedDMCallSession();
    }

    // Ensure LiveKit disconnect flow starts before route transition.
    setIsConnected(false);

    // Best-effort immediate presence cleanup for the current channel.
    fetch('/api/voice/presence', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId }),
      keepalive: true,
    }).catch(() => {});

    if (backgroundMode) {
      return;
    }

    if (isDMCall && friendProfileId) {
      router.replace(`/direct-messages/${friendProfileId}`);
      return;
    }

    if (serverId) {
      const lastTextChannelId = getLastTextChannelId(serverId);
      if (lastTextChannelId && lastTextChannelId !== channelId) {
        router.replace(`/servers/${serverId}/channels/${lastTextChannelId}`);
        return;
      }

      router.replace(`/servers/${serverId}`);
      return;
    }

    router.replace('/');
  }, [isDMCall, backgroundMode, friendProfileId, serverId, channelId, router]);

  useEffect(() => {
    if (isDMCall) return;
    persistServerVoiceSession(channelId, channelName, channelType, serverId);
  }, [isDMCall, channelId, channelName, channelType, serverId]);

  useEffect(() => {
    if (!isDMCall) return;
    if (!friendProfileId) return;

    persistDMCallSession({
      channelId,
      channelName,
      channelType,
      friendProfileId,
      friendAvatarUrl,
      currentUserProfileId,
      currentUserAvatarUrl,
      shouldAutoJoin: isConnected,
      declinedStandby,
    });
  }, [
    isDMCall,
    channelId,
    channelName,
    channelType,
    friendProfileId,
    friendAvatarUrl,
    currentUserProfileId,
    currentUserAvatarUrl,
    isConnected,
    declinedStandby,
  ]);

  const handleControlBarLeave = useCallback(() => {
    if (isDMCall) {
      setIsConnected(false);
      setManualDisconnectStartedAtMs(Date.now());
      manualDisconnectAutoClosedRef.current = false;
      return;
    }

    handleLeave();
  }, [isDMCall, handleLeave]);

  const handleRejoinMode = useCallback((mode: 'audio' | 'video') => {
    if (isDMCall && friendProfileId) {
      stopCallRingSoundLoop();
      setDeclinedStandby(false);
      setManualDisconnectStartedAtMs(null);
      manualDisconnectAutoClosedRef.current = false;
      window.location.assign(`/direct-messages/${friendProfileId}/call?mode=${mode}&accept=1`);
      return;
    }

    setManualDisconnectStartedAtMs(null);
    setIsConnected(true);
  }, [isDMCall, friendProfileId]);

  useEffect(() => {
    if (!isDMCall) return;
    setDeclinedStandby(Boolean(dmDeclinedStandby));
  }, [isDMCall, dmDeclinedStandby]);

  useEffect(() => {
    if (!isDMCall || !isIncomingReceiver) return;
    incomingScreenOpenedAtRef.current = Date.now();
  }, [isDMCall, isIncomingReceiver]);

  useEffect(() => {
    setLiveChannelName(channelName);
  }, [channelName]);

  useEffect(() => {
    if (!isDMCall) return;
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isDMCall]);

  useEffect(() => {
    if (!isDMCall) return;
    if (isConnected) {
      emptyRoomAutoClosedRef.current = false;
      return;
    }

    let disposed = false;

    const checkRoomHeartbeat = async () => {
      if (emptyRoomAutoClosedRef.current || disposed) return;

      try {
        const response = await fetch(`/api/livekit/participants?room=${encodeURIComponent(channelId)}`, {
          method: 'GET',
          cache: 'no-store',
        });

        if (!response.ok) return;
        const body = (await response.json().catch(() => ({}))) as { participantCount?: number };
        const participantCount = typeof body.participantCount === 'number' ? body.participantCount : null;

        if (participantCount === 0) {
          emptyRoomAutoClosedRef.current = true;
          handleLeave();
        }
      } catch {
        // ignore heartbeat failures
      }
    };

    void checkRoomHeartbeat();
    const interval = setInterval(() => {
      void checkRoomHeartbeat();
    }, 1000);

    return () => {
      disposed = true;
      clearInterval(interval);
    };
  }, [isDMCall, isConnected, channelId, handleLeave]);

  useEffect(() => {
    if (!isDMCall || !isConnected) return;

    if (otherParticipantCount > 0) {
      hadPeerConnectedRef.current = true;
      if (remainingAloneSinceMs !== null) {
        setRemainingAloneSinceMs(null);
      }
      remainingAutoClosedRef.current = false;
      return;
    }

    if ((hadPeerConnectedRef.current || !isCallerWaiting) && remainingAloneSinceMs === null) {
      setRemainingAloneSinceMs(Date.now());
    }
  }, [isDMCall, isConnected, otherParticipantCount, remainingAloneSinceMs, isCallerWaiting]);

  useEffect(() => {
    if (!isDMCall || !isConnected) return;
    if (remainingAloneSinceMs === null) return;
    if (remainingAutoClosedRef.current) return;
    if (nowMs - remainingAloneSinceMs < 90_000) return;

    remainingAutoClosedRef.current = true;
    stopCallRingSoundLoop();
    playCallEndSound();
    handleLeave();
  }, [isDMCall, isConnected, nowMs, remainingAloneSinceMs, handleLeave]);

  useEffect(() => {
    if (!isDMCall) return;
    if (!isManualDisconnectedHold) return;
    if (manualDisconnectAutoClosedRef.current) return;
    if (manualDisconnectElapsedMs < 90_000) return;

    manualDisconnectAutoClosedRef.current = true;
    handleLeave();
  }, [isDMCall, isManualDisconnectedHold, manualDisconnectElapsedMs, handleLeave]);

  useEffect(() => {
    if (!isConnected) return;
    if (manualDisconnectStartedAtMs === null) return;

    setManualDisconnectStartedAtMs(null);
    manualDisconnectAutoClosedRef.current = false;
  }, [isConnected, manualDisconnectStartedAtMs]);

  useEffect(() => {
    if (!isDMCall || !isConnected) return;
    if (!isCallerWaiting) return;
    if (hadPeerConnectedRef.current) return;
    if (autoEndedRef.current) return;
    if (elapsedMs < 90_000) return;

    autoEndedRef.current = true;

    const supabase = createClient();
    const missedPayload = {
      callerId: currentUserProfileId,
      callerName: dmCallerName || channelName,
      durationSeconds: Math.floor(elapsedMs / 1000),
      ts: Date.now(),
    };

    void (supabase as any)
      .from('dm_channel_messages')
      .insert({
        dm_channel_id: channelId,
        author_id: currentUserProfileId,
        content: `[CALL_MISSED]${JSON.stringify(missedPayload)}`,
        deleted: false,
      })
      .then(() => {
        window.dispatchEvent(new CustomEvent('dmMessageSent', { detail: { channelId, friendId: friendProfileId } }));
      })
      .catch(() => {
        // ignore
      })
      .finally(() => {
        stopCallRingSoundLoop();
        playCallEndSound();
        handleLeave();
      });
  }, [
    isDMCall,
    isConnected,
    isCallerWaiting,
    elapsedMs,
    currentUserProfileId,
    channelId,
    channelName,
    dmCallerName,
    friendProfileId,
    handleLeave,
  ]);

  useEffect(() => {
    if (!isDMCall) return;
    if (!isIncomingReceiver) return;
    if (declinedStandby) return;
    if (isConnected) return;
    if (manualDisconnectStartedAtMs !== null) return;

    if (incomingScreenElapsedMs < 30_000) {
      startCallRingSoundLoop();
      return () => {
        stopCallRingSoundLoop();
      };
    }

    stopCallRingSoundLoop();

    if (incomingScreenElapsedMs < 90_000) {
      return;
    }

    if (!incomingTimedOutRef.current) {
      incomingTimedOutRef.current = true;
      handleLeave();
    }
  }, [isDMCall, isIncomingReceiver, declinedStandby, isConnected, incomingScreenElapsedMs, manualDisconnectStartedAtMs, handleLeave]);

  useEffect(() => {
    let isMounted = true;

    const loadToken = async () => {
      try {
        const response = await fetch(`/api/livekit?room=${encodeURIComponent(channelId)}`, {
          method: 'GET',
          cache: 'no-store',
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };

          if (response.status === 401) {
            throw new Error('Voice kanala girmek için giriş yapmalısın.');
          }

          if (response.status === 403) {
            throw new Error('Bu voice kanala erişimin yok (server üyesi değilsin).');
          }

          if (response.status === 400) {
            throw new Error(body.error ?? 'Geçersiz istek.');
          }

          throw new Error(body.error ?? 'LiveKit token alınamadı.');
        }

        const body = (await response.json()) as TokenResponse;

        if (isMounted) {
          setToken(body.token);
          setServerUrl(body.url);
        }
      } catch (tokenError) {
        if (isMounted) {
          setError(tokenError instanceof Error ? tokenError.message : 'Unknown LiveKit error');
        }
      }
    };

    void loadToken();

    return () => {
      isMounted = false;
    };
  }, [channelId]);

  useEffect(() => {
    if (!enablePresence) return;
    if (!isConnected) return;

    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let heartbeatInFlight = false;
    let left = false;

    const readVoiceFlags = () => {
      try {
        const stored = localStorage.getItem('drifd-voice-settings');
        if (!stored) {
          return { isMuted: false, isDeafened: false };
        }
        const parsed = JSON.parse(stored) as { isMuted?: boolean; isDeafened?: boolean };
        const isDeafened = Boolean(parsed.isDeafened);
        const isMuted = Boolean(parsed.isMuted) || isDeafened;
        return { isMuted, isDeafened };
      } catch {
        return { isMuted: false, isDeafened: false };
      }
    };

    const sendHeartbeatNow = () => {
      if (heartbeatInFlight || left) return;
      heartbeatInFlight = true;
      const flags = readVoiceFlags();
      fetch('/api/voice/presence/heartbeat', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, isMuted: flags.isMuted, isDeafened: flags.isDeafened }),
      })
        .catch(() => {})
        .finally(() => {
          heartbeatInFlight = false;
        });
    };

    const joinPresence = async () => {
      const flags = readVoiceFlags();
      await fetch('/api/voice/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, isMuted: flags.isMuted, isDeafened: flags.isDeafened }),
      }).catch(() => {});

      heartbeat = setInterval(() => {
        if (heartbeatInFlight || left) return;
        sendHeartbeatNow();
      }, 5000);
    };

    const leavePresence = () => {
      fetch('/api/voice/presence', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId }),
      }).catch(() => {});
    };

    void joinPresence();
    const handleBeforeUnload = () => {
      leavePresence();
      if (!isDMCall) {
        clearPersistedServerVoiceSession();
      } else {
        clearPersistedDMCallSession();
      }
    };

    window.addEventListener('voice-settings-changed', sendHeartbeatNow);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      left = true;
      if (heartbeat) clearInterval(heartbeat);
      window.removeEventListener('voice-settings-changed', sendHeartbeatNow);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      leavePresence();
    };
  }, [enablePresence, isConnected, channelId, isDMCall]);

  useEffect(() => {
    if (isDMCall || backgroundMode) return;

    let disposed = false;
    let checkInFlight = false;

    const checkMovedChannel = async () => {
      if (disposed || checkInFlight || leavingRoomRef.current) return;

      checkInFlight = true;

      try {
        const response = await fetch(`/api/voice/presence/current?channelId=${encodeURIComponent(channelId)}`, {
          method: 'GET',
          cache: 'no-store',
        });

        if (!response.ok) return;
        const body = (await response.json().catch(() => ({}))) as {
          serverId?: string;
          currentChannelId?: string | null;
          currentChannelName?: string | null;
        };

        const currentChannelId = body.currentChannelId || null;
        const serverId = body.serverId || '';
        const currentChannelName = body.currentChannelName || null;

        if (currentChannelName) {
          setLiveChannelName(currentChannelName);
        }

        if (!leavingRoomRef.current && currentChannelId && currentChannelId !== channelId && serverId) {
          router.push(`/servers/${serverId}/channels/${currentChannelId}`);
        }
      } catch {
        // ignore heartbeat failures
      } finally {
        checkInFlight = false;
      }
    };

    void checkMovedChannel();

    const interval = setInterval(() => {
      void checkMovedChannel();
    }, 5000);

    const handleVoiceMoved = () => {
      void checkMovedChannel();
    };
    window.addEventListener('voice-presence-moved', handleVoiceMoved);

    return () => {
      disposed = true;
      clearInterval(interval);
      window.removeEventListener('voice-presence-moved', handleVoiceMoved);
    };
  }, [isDMCall, backgroundMode, channelId, router]);

  useEffect(() => {
    if (isDMCall || backgroundMode) return;

    const supabase = createClient();
    let active = true;
    let cleanup: (() => void) | null = null;

    const setupRealtimeMoveSync = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!active || !user?.id) return;

      const { data: channel } = await (supabase as any)
        .from('channels')
        .select('serverid')
        .eq('id', channelId)
        .maybeSingle();

      const serverId = (channel as any)?.serverid as string | undefined;
      if (!active || !serverId) return;

      const realtime = (supabase as any)
        .channel(`voice-self-${channelId}-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'voice_channel_presence',
            filter: `profileid=eq.${user.id}`,
          },
          (payload: any) => {
            if (leavingRoomRef.current) return;
            const nextChannelId = payload?.new?.channelid as string | undefined;
            if (!nextChannelId || nextChannelId === channelId) return;
            router.push(`/servers/${serverId}/channels/${nextChannelId}`);
          },
        )
        .subscribe();

      cleanup = () => {
        try {
          (supabase as any).removeChannel(realtime);
        } catch {
          // ignore
        }
      };
    };

    void setupRealtimeMoveSync();

    return () => {
      active = false;
      cleanup?.();
    };
  }, [isDMCall, backgroundMode, channelId, router]);

  useEffect(() => {
    if (isRequesting && !isConnected) {
      startCallRingSoundLoop();
      return;
    }

    stopCallRingSoundLoop();
  }, [isConnected, isRequesting]);

  useEffect(() => {
    return () => {
      stopCallRingSoundLoop();
    };
  }, []);

  useEffect(() => {
    if (isConnected && !wasConnectedRef.current) {
      playCallStartSound();
    }

    if (!isConnected && wasConnectedRef.current) {
      playCallEndSound();
    }

    wasConnectedRef.current = isConnected;
  }, [isConnected]);

  const handleJoinChannel = async () => {
    setPermissionError(null);
    setIsRequesting(true);

    // Read selected input device from stored settings
    let selectedDevice: string | undefined;
    try {
      const stored = localStorage.getItem('drifd-voice-settings');
      if (stored) {
        const s = JSON.parse(stored);
        if (s.selectedInputDevice) selectedDevice = s.selectedInputDevice;
      }
    } catch { /* ignore */ }
    
    // Request appropriate permissions based on channel type
    try {
      const audioConstraints: MediaStreamConstraints['audio'] = selectedDevice
        ? { deviceId: { exact: selectedDevice } }
        : true;

      if (channelType === 'VIDEO') {
        await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: true });
      } else {
        await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      }
      
      // Permissions granted, connect to room
      setIsRequesting(false);
      setIsConnected(true);
    } catch (err) {
      const error = err as Error;
      setIsRequesting(false);
      
      if (error.name === 'NotAllowedError') {
        setPermissionError(
          'İzin reddedildi. Tarayıcı adres çubuğundaki kilit simgesine tıkla → Site ayarları → ' + 
          (channelType === 'VIDEO' ? 'Mikrofon ve Kamera' : 'Mikrofon') + ' → İzin ver'
        );
      } else if (error.name === 'NotFoundError') {
        setPermissionError(
          (channelType === 'VIDEO' ? 'Mikrofon veya kamera' : 'Mikrofon') + 
          ' bulunamadı. Cihazların bağlı olduğundan emin ol.'
        );
      } else {
        setPermissionError(`Hata: ${error.message}`);
      }
    }
  };

  if (error) {
    return (
      <div className={`flex w-full items-center justify-center bg-drifd-tertiary ${embedded ? 'h-full' : 'h-screen'}`}>
        <div className="max-w-md rounded-xl border border-red-500/50 bg-drifd-secondary p-6 text-center">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!token || !serverUrl) {
    return (
      <div className={`w-full bg-drifd-tertiary ${embedded ? 'h-full' : 'h-screen'}`}>
        <div className="h-full w-full" />
      </div>
    );
  }

  const isAudioOnly = channelType === 'AUDIO';

  // Read stored voice settings for device selection
  let storedInputDevice: string | undefined;
  try {
    const stored = localStorage.getItem('drifd-voice-settings');
    if (stored) {
      const s = JSON.parse(stored);
      if (s.selectedInputDevice) storedInputDevice = s.selectedInputDevice;
    }
  } catch { /* ignore */ }

  return (
    <div className={`${embedded ? 'h-full' : 'h-screen'} w-full bg-drifd-tertiary`}>
      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        connect={isConnected}
        audio={isDMCall ? false : (storedInputDevice ? { deviceId: { exact: storedInputDevice } } : true)}
        video={isDMCall ? false : !isAudioOnly}
        data-lk-theme="default"
        className="h-full"
      >
        <RoomAudioRenderer />
        {isDMCall ? <DMOtherParticipantCountBridge onChange={setOtherParticipantCount} /> : null}
        <OutputVolumeController />
        <CallSoundEffects isConnected={isConnected} />
        {isDMCall ? (
          <div className="relative z-10 h-full w-full overflow-visible bg-black">
            <DMCallHeaderAvatars
              channelName={channelName}
              friendAvatarUrl={friendAvatarUrl}
              currentUserAvatarUrl={currentUserAvatarUrl}
              friendProfileId={friendProfileId}
              currentUserProfileId={currentUserProfileId}
              hideFriendAvatar={hideFriendAvatar}
              pulseCurrentAvatar={shouldPulseCurrentAvatar}
              soloAvatarMode={soloAvatarMode}
            />

            {showDMRejoinStandby ? (
              <div className="absolute bottom-1 left-1/2 z-30 -translate-x-1/2 overflow-visible">
                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#111318]/96 px-2 py-1.5 shadow-2xl backdrop-blur-sm">
                  <button
                    type="button"
                    onClick={() => handleRejoinMode('video')}
                    className="flex h-9 w-10 items-center justify-center rounded-md bg-green-600 text-white transition-colors hover:bg-green-700"
                    title="Goruntulu Katil"
                  >
                    <Video className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRejoinMode('audio')}
                    className="flex h-9 w-10 items-center justify-center rounded-md bg-green-600 text-white transition-colors hover:bg-green-700"
                    title="Sesli Katil"
                  >
                    <Phone className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : null}

            {!isManualDisconnectedHold && !showDMRejoinStandby && isConnected ? (
              <div className="absolute bottom-1 left-1/2 z-30 -translate-x-1/2 overflow-visible">
                <DiscordControlBar showCamera={!isAudioOnly} onLeave={handleControlBarLeave} menuDirection="down" />
              </div>
            ) : null}
          </div>
        ) : isAudioOnly ? (
          <div className="h-[calc(100%-64px)]">
            <div className="flex h-12 items-center justify-between border-b border-drifd-divider px-4">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-white">🔊 {liveChannelName}</p>
                <span className="text-xs text-drifd-muted">Voice</span>
              </div>
            </div>
            <div className="h-[calc(100%-48px)] overflow-y-auto p-4">
                <VoiceStreamingLayout channelId={channelId} serverId={serverId} />
            </div>
          </div>
        ) : (
          <div className="h-[calc(100%-64px)]">
            <div className="flex h-12 items-center border-b border-drifd-divider px-4">
              <p className="text-sm font-bold text-white">🎥 {liveChannelName}</p>
              <span className="ml-2 text-xs text-drifd-muted">Video Conference</span>
            </div>
            <div className="h-[calc(100%-48px)] overflow-hidden">
              <VideoParticipantLayout channelId={channelId} serverId={serverId} />
            </div>
          </div>
        )}
        {!isDMCall ? (
          <div className="border-t border-drifd-divider bg-drifd-secondary/60">
            <DiscordControlBar showCamera={!isAudioOnly} onLeave={handleLeave} menuDirection="up" />
          </div>
        ) : null}
      </LiveKitRoom>
    </div>
  );
}
