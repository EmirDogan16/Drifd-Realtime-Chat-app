'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MediaRoom } from '@/components/media/media-room';

type VoiceSession = {
  channelId: string;
  channelName: string;
  channelType: 'AUDIO' | 'VIDEO';
  serverId: string | null;
};

const ACTIVE_SERVER_VOICE_SESSION_KEY = 'drifd-active-server-voice-session';

export function GlobalServerVoiceSession() {
  const pathname = usePathname();
  const [session, setSession] = useState<VoiceSession | null>(null);

  useEffect(() => {
    const readSession = () => {
      try {
        const raw = localStorage.getItem(ACTIVE_SERVER_VOICE_SESSION_KEY);
        if (!raw) {
          setSession(null);
          return;
        }

        const parsed = JSON.parse(raw) as VoiceSession;
        if (!parsed?.channelId || !parsed?.channelName || !parsed?.channelType) {
          setSession(null);
          return;
        }

        setSession(parsed);
      } catch {
        setSession(null);
      }
    };

    readSession();
    window.addEventListener('voice-session-updated', readSession);
    window.addEventListener('storage', readSession);

    return () => {
      window.removeEventListener('voice-session-updated', readSession);
      window.removeEventListener('storage', readSession);
    };
  }, []);

  const isOnActiveVoiceRoute = useMemo(() => {
    if (!session?.serverId || !session.channelId) return false;
    return pathname === `/servers/${session.serverId}/channels/${session.channelId}`;
  }, [pathname, session]);

  if (!session || !session.serverId || isOnActiveVoiceRoute) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-3 right-3 z-[80] h-[260px] w-[420px] max-w-[calc(100vw-24px)] overflow-hidden rounded-xl border border-drifd-divider bg-drifd-tertiary shadow-2xl">
      <div className="pointer-events-auto flex h-9 items-center justify-between border-b border-drifd-divider bg-drifd-secondary/90 px-3">
        <p className="truncate text-xs font-semibold text-white">
          Voice devam ediyor: {session.channelName}
        </p>
        <Link
          href={`/servers/${session.serverId}/channels/${session.channelId}`}
          className="rounded bg-drifd-hover px-2 py-1 text-[11px] font-medium text-white hover:bg-drifd-primary hover:text-black"
        >
          Kanala Don
        </Link>
      </div>

      <div className="pointer-events-auto h-[calc(100%-36px)]">
        <MediaRoom
          channelId={session.channelId}
          channelName={session.channelName}
          channelType={session.channelType}
          serverId={session.serverId}
          embedded={true}
          backgroundMode={true}
        />
      </div>
    </div>
  );
}
