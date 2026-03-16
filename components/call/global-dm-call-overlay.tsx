'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { startCallRingSoundLoop, stopCallRingSoundLoop } from '@/lib/sound-effects';

type CallMode = 'audio' | 'video';

interface IncomingCallInvite {
  inviteId: string;
  callerId: string;
  callerName: string;
  callerAvatarUrl: string | null;
  mode: CallMode;
  createdAtMs: number;
}

interface RejoinCallState {
  friendId: string;
  friendName: string;
  friendAvatarUrl: string | null;
  mode: CallMode;
  createdAtMs: number;
}

function getInitials(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const [first, second] = trimmed.split(/\s+/).filter(Boolean).slice(0, 2);
  return `${first?.[0] ?? ''}${second?.[0] ?? ''}`.toUpperCase() || trimmed[0]?.toUpperCase() || '?';
}

function parseCallInvite(rawContent: string): { mode: CallMode } | null {
  if (!rawContent.startsWith('[CALL_INVITE]')) return null;

  try {
    const parsed = JSON.parse(rawContent.slice('[CALL_INVITE]'.length)) as { mode?: string };
    const mode = String(parsed.mode || 'AUDIO').toLowerCase() === 'video' ? 'video' : 'audio';
    return { mode };
  } catch {
    return { mode: 'audio' };
  }
}

export function GlobalDMCallOverlay() {
  const supabase = useMemo(() => createClient(), []);
  const pathname = usePathname();

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCallInvite | null>(null);
  const [rejoinCall, setRejoinCall] = useState<RejoinCallState | null>(null);

  const dismissedInviteIdsRef = useRef<Set<string>>(new Set());
  const profileCacheRef = useRef<Map<string, { username: string; imageurl: string | null }>>(new Map());

  useEffect(() => {
    let isMounted = true;

    const loadUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!isMounted) return;
      setCurrentUserId(user?.id || null);
    };

    void loadUser();

    return () => {
      isMounted = false;
    };
  }, [supabase]);

  useEffect(() => {
    if (!currentUserId) return;

    let isActive = true;
    let refreshInFlight = false;

    const loadProfile = async (profileId: string) => {
      const cached = profileCacheRef.current.get(profileId);
      if (cached) return cached;

      const { data: profile } = await supabase
        .from('profiles')
        .select('username, imageurl')
        .eq('id', profileId)
        .maybeSingle();

      const parsed = {
        username: (profile as any)?.username || 'Bilinmeyen Kullanici',
        imageurl: (profile as any)?.imageurl || null,
      };

      profileCacheRef.current.set(profileId, parsed);
      return parsed;
    };

    const refreshOverlayState = async () => {
      if (refreshInFlight) return;
      refreshInFlight = true;
      try {
        const now = Date.now();

        const { data: dmChannels, error: channelsError } = await supabase
          .from('dm_channels')
          .select('id, profile_one_id, profile_two_id')
          .or(`profile_one_id.eq.${currentUserId},profile_two_id.eq.${currentUserId}`);

        if (!isActive) return;
        if (channelsError || !Array.isArray(dmChannels) || dmChannels.length === 0) {
          setIncomingCall(null);
          setRejoinCall(null);
          stopCallRingSoundLoop();
          return;
        }

        const channelMap = new Map<string, { otherProfileId: string }>();
        dmChannels.forEach((channel: any) => {
          const otherProfileId = channel.profile_one_id === currentUserId ? channel.profile_two_id : channel.profile_one_id;
          channelMap.set(channel.id, { otherProfileId });
        });

        const channelIds = [...channelMap.keys()];

        const { data: rows, error: messagesError } = await supabase
          .from('dm_channel_messages')
          .select('id, content, author_id, dm_channel_id, created_at')
          .in('dm_channel_id', channelIds)
          .order('created_at', { ascending: false })
          .limit(80);

        if (!isActive) return;
        if (messagesError || !Array.isArray(rows)) {
          return;
        }

        const invites = rows
          .map((row: any) => {
            const parsed = parseCallInvite(String(row?.content || ''));
            if (!parsed) return null;
            const createdAtMs = row?.created_at ? new Date(row.created_at).getTime() : 0;
            if (!createdAtMs || now - createdAtMs > 90_000) return null;
            return { row, mode: parsed.mode, createdAtMs };
          })
          .filter(Boolean) as Array<{ row: any; mode: CallMode; createdAtMs: number }>;

        setRejoinCall(null);

        const incomingCandidate = invites.find((item) => {
          const row = item.row;
          if (!row?.id || dismissedInviteIdsRef.current.has(row.id)) return false;
          if (String(row.author_id || '') === currentUserId) return false;
          return now - item.createdAtMs <= 45_000;
        });

        if (!incomingCandidate) {
          setIncomingCall((prev) => {
            if (!prev) return prev;
            if (now - prev.createdAtMs > 45_000) {
              stopCallRingSoundLoop();
              return null;
            }
            return prev;
          });
          return;
        }

        const callerId = String(incomingCandidate.row.author_id || '');
        if (!callerId) {
          return;
        }

        const profile = await loadProfile(callerId);
        if (!isActive) return;

        setIncomingCall((prev) => {
          if (prev?.inviteId === incomingCandidate.row.id) return prev;
          return {
            inviteId: incomingCandidate.row.id,
            callerId,
            callerName: profile.username,
            callerAvatarUrl: profile.imageurl,
            mode: incomingCandidate.mode,
            createdAtMs: incomingCandidate.createdAtMs,
          };
        });

        if (!pathname?.includes('/call')) {
          startCallRingSoundLoop();
        }
      } finally {
        refreshInFlight = false;
      }
    };

    void refreshOverlayState();
    const interval = setInterval(() => {
      void refreshOverlayState();
    }, 5000);

    return () => {
      isActive = false;
      clearInterval(interval);
      stopCallRingSoundLoop();
    };
  }, [currentUserId, pathname, supabase]);

  useEffect(() => {
    if (!incomingCall) {
      stopCallRingSoundLoop();
      return;
    }

    const onCallerCallPage = pathname?.startsWith(`/direct-messages/${incomingCall.callerId}/call`);
    if (onCallerCallPage) {
      dismissedInviteIdsRef.current.add(incomingCall.inviteId);
      setIncomingCall(null);
      stopCallRingSoundLoop();
    }
  }, [incomingCall, pathname]);

  const handleDecline = () => {
    if (!incomingCall) return;
    dismissedInviteIdsRef.current.add(incomingCall.inviteId);
    const next = incomingCall;
    setIncomingCall(null);
    stopCallRingSoundLoop();
    window.location.assign(`/direct-messages/${next.callerId}/call?mode=${next.mode}&decline=1`);
  };

  const handleAccept = () => {
    if (!incomingCall) return;
    dismissedInviteIdsRef.current.add(incomingCall.inviteId);
    setIncomingCall(null);
    stopCallRingSoundLoop();
    window.location.assign(`/direct-messages/${incomingCall.callerId}/call?mode=${incomingCall.mode}&accept=1`);
  };

  const handleRejoin = () => {
    if (!rejoinCall) return;
    window.location.assign(`/direct-messages/${rejoinCall.friendId}/call?mode=${rejoinCall.mode}&accept=1`);
  };

  if (!incomingCall && !rejoinCall) return null;

  const modeLabel = incomingCall?.mode === 'video' ? 'Goruntulu Arama' : 'Sesli Arama';

  return (
    <>
      {rejoinCall ? (
        <div className="fixed bottom-6 left-1/2 z-[118] w-[min(94vw,440px)] -translate-x-1/2 rounded-2xl border border-white/10 bg-[#131722]/95 px-4 py-3 shadow-[0_22px_56px_rgba(0,0,0,0.5)] backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 overflow-hidden rounded-full border border-white/15 bg-drifd-hover">
              {rejoinCall.friendAvatarUrl ? (
                <img src={rejoinCall.friendAvatarUrl} alt={rejoinCall.friendName} className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-sm font-bold text-white">
                  {getInitials(rejoinCall.friendName)}
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{rejoinCall.friendName} hala aramada</p>
              <p className="text-xs text-drifd-muted">Tekrar katilmak icin yesil butona bas.</p>
            </div>

            <button
              type="button"
              onClick={handleRejoin}
              className="rounded-lg bg-[#2ea35a] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#278b4b]"
            >
              Yeniden Katil
            </button>
          </div>
        </div>
      ) : null}

      {incomingCall ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/35 px-4 backdrop-blur-[2px]">
          <div className="w-full max-w-[360px] overflow-hidden rounded-3xl border border-white/10 bg-[#171a23] shadow-[0_30px_70px_rgba(0,0,0,0.55)]">
            <div className="h-1 w-full bg-gradient-to-r from-[#2ea35a] via-[#25a7e8] to-[#2ea35a]" />

            <div className="px-7 pb-7 pt-6">
              <div className="mb-5 flex items-center justify-center">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-drifd-muted">
                  {modeLabel}
                </span>
              </div>

              <div className="relative mb-5 flex justify-center">
                <span className="absolute inset-0 m-auto h-28 w-28 rounded-full border border-white/25 animate-ping" />
                <span className="absolute inset-0 m-auto h-[120px] w-[120px] rounded-full border border-white/10" />

                <div className="relative h-24 w-24 rounded-full border-2 border-white/30 p-1.5 bg-[#0d0f15]">
                  <div className="h-full w-full rounded-full overflow-hidden bg-drifd-hover flex items-center justify-center">
                    {incomingCall.callerAvatarUrl ? (
                      <img src={incomingCall.callerAvatarUrl} alt={incomingCall.callerName} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xl font-bold text-white">{getInitials(incomingCall.callerName)}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="text-center">
                <div className="mb-1 truncate text-[31px] font-semibold leading-tight text-white">{incomingCall.callerName}</div>
                <p className="mb-6 text-sm text-drifd-muted">Seni ariyor...</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleDecline}
                  className="flex h-14 items-center justify-center gap-2 rounded-xl bg-[#d93646] text-white transition-colors hover:bg-[#c42a39]"
                  title="Reddet"
                >
                  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" className="text-white">
                    <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                  </svg>
                  <span className="text-sm font-semibold">Reddet</span>
                </button>

                <button
                  type="button"
                  onClick={handleAccept}
                  className="flex h-14 items-center justify-center gap-2 rounded-xl bg-[#2ea35a] text-white transition-colors hover:bg-[#278b4b]"
                  title="Kabul Et"
                >
                  <svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor" className="text-white">
                    <path d="M6.62 10.79a15.464 15.464 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 011 1V20a1 1 0 01-1 1C10.85 21 3 13.15 3 3a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.46.57 3.58a1 1 0 01-.24 1.01l-2.21 2.2z" />
                  </svg>
                  <span className="text-sm font-semibold">Kabul Et</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
