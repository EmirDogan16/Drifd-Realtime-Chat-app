'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

const MUTED_SERVERS_KEY = 'drifd-muted-servers';
const MUTED_SCOPES_KEY = 'drifd-muted-scopes';

function readSet(key: string) {
  if (typeof window === 'undefined') return new Set<string>();

  try {
    const raw = window.localStorage.getItem(key);
    return new Set<string>(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set<string>();
  }
}

function writeSet(key: string, values: Set<string>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(Array.from(values)));
}

export function getChatScopeKey(channelId: string, isDM = false) {
  return `${isDM ? 'dm' : 'channel'}:${channelId}`;
}

export function useNotificationPreferences(serverId?: string, scopeKey?: string) {
  // Keep first render deterministic between server and client to avoid hydration mismatch.
  const [mutedServers, setMutedServers] = useState<Set<string>>(new Set());
  const [mutedScopes, setMutedScopes] = useState<Set<string>>(new Set());

  useEffect(() => {
    setMutedServers(readSet(MUTED_SERVERS_KEY));
    setMutedScopes(readSet(MUTED_SCOPES_KEY));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleStorage = () => {
      setMutedServers(readSet(MUTED_SERVERS_KEY));
      setMutedScopes(readSet(MUTED_SCOPES_KEY));
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }, []);

  const toggleServerMute = useCallback(async () => {
    const next = new Set(mutedServers);
    if (serverId) {
      if (next.has(serverId)) {
        next.delete(serverId);
        await requestPermission();
      } else {
        next.add(serverId);
      }
      setMutedServers(next);
      writeSet(MUTED_SERVERS_KEY, next);
    }
  }, [mutedServers, requestPermission, serverId]);

  const toggleScopeMute = useCallback(async () => {
    const next = new Set(mutedScopes);
    if (scopeKey) {
      if (next.has(scopeKey)) {
        next.delete(scopeKey);
        await requestPermission();
      } else {
        next.add(scopeKey);
      }
      setMutedScopes(next);
      writeSet(MUTED_SCOPES_KEY, next);
    }
  }, [mutedScopes, requestPermission, scopeKey]);

  return useMemo(() => ({
    isServerMuted: serverId ? mutedServers.has(serverId) : false,
    isScopeMuted: scopeKey ? mutedScopes.has(scopeKey) : false,
    toggleServerMute,
    toggleScopeMute,
  }), [mutedScopes, mutedServers, scopeKey, serverId, toggleScopeMute, toggleServerMute]);
}

export function canNotifyForServer(serverId?: string) {
  if (!serverId || typeof window === 'undefined') return true;
  return !readSet(MUTED_SERVERS_KEY).has(serverId);
}

export function canNotifyForScope(scopeKey: string) {
  if (typeof window === 'undefined') return true;
  return !readSet(MUTED_SCOPES_KEY).has(scopeKey);
}

export function showDesktopNotification(title: string, body: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  if (document.hasFocus()) return;

  const notification = new Notification(title, { body, silent: false });
  setTimeout(() => notification.close(), 5000);
}