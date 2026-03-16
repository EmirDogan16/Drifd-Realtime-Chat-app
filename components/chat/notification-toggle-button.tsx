'use client';

import { Bell, BellOff } from 'lucide-react';
import { getChatScopeKey, useNotificationPreferences } from '@/hooks/use-notification-preferences';

interface NotificationToggleButtonProps {
  channelId: string;
  isDM?: boolean;
}

export function NotificationToggleButton({ channelId, isDM = false }: NotificationToggleButtonProps) {
  const scopeKey = getChatScopeKey(channelId, isDM);
  const { isScopeMuted, toggleScopeMute } = useNotificationPreferences(undefined, scopeKey);

  return (
    <button
      type="button"
      onClick={() => void toggleScopeMute()}
      className="flex h-8 w-8 items-center justify-center rounded-md text-drifd-muted transition-colors hover:bg-drifd-hover hover:text-drifd-text"
      title={isScopeMuted ? 'Bildirimleri aç' : 'Bildirimleri kapat'}
    >
      {isScopeMuted ? <BellOff className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
    </button>
  );
}