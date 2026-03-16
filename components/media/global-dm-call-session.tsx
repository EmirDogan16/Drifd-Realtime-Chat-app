'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MediaRoom } from '@/components/media/media-room';

type DMCallSession = {
  channelId: string;
  channelName: string;
  channelType: 'AUDIO' | 'VIDEO';
  friendProfileId: string;
  friendAvatarUrl: string | null;
  currentUserProfileId: string | null;
  currentUserAvatarUrl: string | null;
  shouldAutoJoin?: boolean;
  declinedStandby?: boolean;
};

const ACTIVE_DM_CALL_SESSION_KEY = 'drifd-active-dm-call-session';

export function GlobalDMCallSession() {
  const pathname = usePathname();
  const [session, setSession] = useState<DMCallSession | null>(null);

  useEffect(() => {
    const readSession = () => {
      try {
        const raw = localStorage.getItem(ACTIVE_DM_CALL_SESSION_KEY);
        if (!raw) {
          setSession(null);
          return;
        }

        const parsed = JSON.parse(raw) as DMCallSession;
        if (!parsed?.channelId || !parsed?.friendProfileId) {
          setSession(null);
          return;
        }

        setSession(parsed);
      } catch {
        setSession(null);
      }
    };

    readSession();
    window.addEventListener('dm-call-session-updated', readSession);
    window.addEventListener('storage', readSession);

    return () => {
      window.removeEventListener('dm-call-session-updated', readSession);
      window.removeEventListener('storage', readSession);
    };
  }, []);

  const isOnCallRoute = useMemo(() => {
    if (!session?.friendProfileId) return false;
    return pathname?.startsWith(`/direct-messages/${session.friendProfileId}/call`) ?? false;
  }, [pathname, session]);

  if (!session || isOnCallRoute) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-3 right-3 z-[82] h-[260px] w-[420px] max-w-[calc(100vw-24px)] overflow-hidden rounded-xl border border-drifd-divider bg-drifd-tertiary shadow-2xl">
      <div className="pointer-events-auto flex h-9 items-center justify-between border-b border-drifd-divider bg-drifd-secondary/90 px-3">
        <p className="truncate text-xs font-semibold text-white">
          DM arama devam ediyor: {session.channelName}
        </p>
        <Link
          href={`/direct-messages/${session.friendProfileId}/call?mode=${session.channelType === 'VIDEO' ? 'video' : 'audio'}${session.declinedStandby ? '&decline=1' : '&accept=1'}`}
          className="rounded bg-drifd-hover px-2 py-1 text-[11px] font-medium text-white hover:bg-drifd-primary hover:text-black"
        >
          Aramaya Don
        </Link>
      </div>

      <div className="pointer-events-auto h-[calc(100%-36px)]">
        <MediaRoom
          channelId={session.channelId}
          channelName={session.channelName}
          channelType={session.channelType}
          enablePresence={false}
          isDMCall={true}
          embedded={true}
          friendAvatarUrl={session.friendAvatarUrl}
          currentUserAvatarUrl={session.currentUserAvatarUrl}
          friendProfileId={session.friendProfileId}
          currentUserProfileId={session.currentUserProfileId}
          dmAutoJoin={Boolean(session.shouldAutoJoin)}
          dmDeclinedStandby={Boolean(session.declinedStandby)}
          backgroundMode={true}
        />
      </div>
    </div>
  );
}
