'use client';

import { useEffect } from 'react';
import { setLastTextChannelId } from '@/components/navigation/last-text-channel';

interface RememberLastTextChannelProps {
  serverId: string;
  channelId: string;
  enabled: boolean;
}

export function RememberLastTextChannel({ serverId, channelId, enabled }: RememberLastTextChannelProps) {
  useEffect(() => {
    if (!enabled) return;
    setLastTextChannelId(serverId, channelId);
  }, [channelId, enabled, serverId]);

  return null;
}
