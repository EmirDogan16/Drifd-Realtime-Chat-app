'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getLastTextChannelId } from '@/components/navigation/last-text-channel';

interface ServerHomeRedirectProps {
  serverId: string;
  fallbackChannelId: string | null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function ServerHomeRedirect({ serverId, fallbackChannelId }: ServerHomeRedirectProps) {
  const router = useRouter();

  useEffect(() => {
    // Validate serverId to prevent redirecting with invalid parameters
    if (!serverId || !isUuid(serverId)) {
      console.error('ServerHomeRedirect: invalid serverId', serverId);
      return;
    }

    const last = getLastTextChannelId(serverId);
    const targetChannelId = last ?? fallbackChannelId;
    
    // Validate targetChannelId before redirecting
    if (!targetChannelId || !isUuid(targetChannelId)) {
      console.warn('ServerHomeRedirect: no valid channel to redirect to');
      return;
    }
    
    router.replace(`/servers/${serverId}/channels/${targetChannelId}`);
  }, [fallbackChannelId, router, serverId]);

  return (
    <section className="flex h-screen items-center justify-center px-8 text-center">
      <div className="max-w-xl rounded-lg border border-drifd-divider bg-drifd-secondary p-6">
        <h1 className="mb-2 text-2xl font-bold text-white">Drifd Server</h1>
        <p className="text-sm text-drifd-muted">Son kaldığın kanala yönlendiriliyor…</p>
      </div>
    </section>
  );
}
