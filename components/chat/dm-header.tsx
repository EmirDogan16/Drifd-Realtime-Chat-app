'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

interface DMHeaderProps {
  friendId: string;
  initialUsername: string;
  initialImageUrl: string | null;
}

function getDisplayStatus(status?: string | null, lastSeen?: string | null) {
  const lastSeenDate = lastSeen ? new Date(lastSeen) : null;
  const isRecentlyActive = lastSeenDate && (Date.now() - lastSeenDate.getTime() < 120000);

  if (status === 'invisible' || !isRecentlyActive) return 'offline';
  if (status === 'idle' || status === 'dnd') return status;
  return 'online';
}

function statusColor(status: 'online' | 'idle' | 'dnd' | 'offline') {
  if (status === 'online') return 'bg-green-500';
  if (status === 'idle') return 'bg-yellow-500';
  if (status === 'dnd') return 'bg-red-500';
  return 'bg-gray-500';
}

function statusLabel(status: 'online' | 'idle' | 'dnd' | 'offline') {
  if (status === 'online') return 'Çevrimiçi';
  if (status === 'idle') return 'Boşta';
  if (status === 'dnd') return 'Rahatsız Etmeyin';
  return 'Çevrimdışı';
}

function getInitials(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const [first, second] = trimmed.split(/\s+/).filter(Boolean).slice(0, 2);
  return `${first?.[0] ?? ''}${second?.[0] ?? ''}`.toUpperCase() || trimmed[0]?.toUpperCase() || '?';
}

export function DMHeader({ friendId, initialUsername, initialImageUrl }: DMHeaderProps) {
  const [username, setUsername] = useState(initialUsername);
  const [imageUrl, setImageUrl] = useState(initialImageUrl);
  const [status, setStatus] = useState<'online' | 'idle' | 'dnd' | 'offline'>('offline');

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    let inFlight = false;

    const refreshProfile = async () => {
      if (inFlight) return;
      inFlight = true;
      const { data: profile } = await supabase
        .from('profiles')
        .select('username, imageurl, status, last_seen')
        .eq('id', friendId)
        .single() as {
          data: { username: string; imageurl: string | null; status: string | null; last_seen: string | null } | null;
        };

      inFlight = false;
      if (!active || !profile) return;

      setUsername(profile.username);
      setImageUrl(profile.imageurl);
      setStatus(getDisplayStatus(profile.status, profile.last_seen));
    };

    void refreshProfile();
    const interval = setInterval(() => {
      void refreshProfile();
    }, 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [friendId]);

  return (
    <div className="flex items-center gap-3">
      <div className="relative flex-shrink-0">
        <div className="w-8 h-8 rounded-full bg-drifd-hover flex items-center justify-center overflow-hidden">
          {imageUrl ? (
            <img src={imageUrl} alt={username} className="w-full h-full object-cover" />
          ) : (
            <span className="text-xs font-bold text-white">{getInitials(username)}</span>
          )}
        </div>
        <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-drifd-secondary ${statusColor(status)}`} />
      </div>

      <div className="flex flex-col min-w-0">
        <h2 className="text-base font-semibold text-white leading-tight truncate">{username}</h2>
        <p className="text-xs text-drifd-muted leading-tight">{statusLabel(status)}</p>
      </div>
    </div>
  );
}