'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

interface Friend {
  friendshipId: string;
  friendId: string;
  dmChannelId?: string | null;
  friend: {
    id: string;
    username: string;
    imageurl: string | null;
    status?: 'online' | 'idle' | 'dnd' | 'offline';
    last_seen?: string | null;
  };
  lastMessageAt?: string;
}

interface DMFriendsListProps {
  friends: Friend[];
}

function getInitials(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const [first, second] = trimmed.split(/\s+/).filter(Boolean).slice(0, 2);
  return `${first?.[0] ?? ''}${second?.[0] ?? ''}`.toUpperCase() || trimmed[0]?.toUpperCase() || '?';
}

function getDisplayStatus(status?: string | null, lastSeen?: string | null) {
  const lastSeenDate = lastSeen ? new Date(lastSeen) : null;
  const isRecentlyActive = lastSeenDate && (Date.now() - lastSeenDate.getTime() < 120000);

  if (status === 'invisible' || !isRecentlyActive) return 'offline';
  if (status === 'idle' || status === 'dnd') return status;
  return 'online';
}

function normalizeStatus(status?: string | null, lastSeen?: string | null): Friend['friend']['status'] {
  return getDisplayStatus(status, lastSeen) as Friend['friend']['status'];
}

const CLOSED_DMS_KEY = 'drifd_closed_dms';

export function DMFriendsList({ friends }: DMFriendsListProps) {
  const [friendItems, setFriendItems] = useState(friends);
  const [closedDMs, setClosedDMs] = useState<Set<string>>(new Set());
  const pathname = usePathname();
  const router = useRouter();
  const prevLastMessagesRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    setFriendItems(friends);
  }, [friends]);

  // Load closed DMs from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(CLOSED_DMS_KEY);
      if (stored) {
        setClosedDMs(new Set(JSON.parse(stored)));
      }
    } catch (error) {
      console.error('Failed to load closed DMs:', error);
    }
  }, []);

  // Refresh DM list when a message is sent
  useEffect(() => {
    const supabase = createClient();

    const upsertFriendItem = async (targetFriendId: string, sentAt: string, sentChannelId?: string) => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, username, imageurl, status, last_seen')
        .eq('id', targetFriendId)
        .maybeSingle();

      setFriendItems((prev) => {
        const existing = prev.find((item) => item.friendId === targetFriendId);
        if (existing) {
          return prev.map((item) => (
            item.friendId === targetFriendId
              ? {
                  ...item,
                  dmChannelId: sentChannelId || item.dmChannelId || null,
                  lastMessageAt: sentAt,
                }
              : item
          ));
        }

        const fallbackStatus = normalizeStatus((profile as any)?.status, (profile as any)?.last_seen);
        return [
          {
            friendshipId: `local-${targetFriendId}`,
            friendId: targetFriendId,
            dmChannelId: sentChannelId || null,
            lastMessageAt: sentAt,
            friend: {
              id: targetFriendId,
              username: (profile as any)?.username || 'Unknown',
              imageurl: (profile as any)?.imageurl || null,
              status: fallbackStatus,
              last_seen: (profile as any)?.last_seen || null,
            },
          },
          ...prev,
        ];
      });
    };

    const handleDMMessageSent = (event: Event) => {
      const customEvent = event as CustomEvent<{ channelId?: string; friendId?: string }>;
      const sentFriendId = customEvent.detail?.friendId;
      const sentChannelId = customEvent.detail?.channelId;

      const currentPathMatch = window.location.pathname.match(/^\/direct-messages\/([^\/]+)$/);
      const activeFriendId = currentPathMatch ? currentPathMatch[1] : null;

      const targetFriendId = sentFriendId
        || friendItems.find((item) => item.dmChannelId && item.dmChannelId === sentChannelId)?.friendId
        || activeFriendId;

      if (!targetFriendId) {
        // Keep data fresh even if we couldn't map the event to a friend.
        setTimeout(() => {
          router.refresh();
        }, 500);
        return;
      }

      const sentAt = new Date().toISOString();
      void upsertFriendItem(targetFriendId, sentAt, sentChannelId);

      // Re-open immediately when a new message is sent to this friend.
      setClosedDMs((prev) => {
        if (!prev.has(targetFriendId)) return prev;
        const next = new Set(prev);
        next.delete(targetFriendId);
        try {
          localStorage.setItem(CLOSED_DMS_KEY, JSON.stringify(Array.from(next)));
        } catch (error) {
          console.error('Failed to save closed DMs:', error);
        }
        return next;
      });

      // Refresh in background so server-sorted order converges shortly after optimistic UI update.
      setTimeout(() => {
        router.refresh();
      }, 500);
    };

    window.addEventListener('dmMessageSent', handleDMMessageSent as EventListener);
    return () => window.removeEventListener('dmMessageSent', handleDMMessageSent as EventListener);
  }, [friendItems, router]);

  // Refresh DM list periodically ONLY on main DM page (not in chat)
  useEffect(() => {
    // Only refresh on main DM page, not when viewing a specific chat
    const isMainDMPage = pathname === '/direct-messages';
    
    if (isMainDMPage) {
      // Set up interval for periodic refresh (every 30 seconds - less aggressive)
      const interval = setInterval(() => {
        router.refresh();
      }, 30000);
      
      return () => clearInterval(interval);
    }
  }, [pathname, router]);

  // Re-open DM only when new message is received (lastMessageAt changed)
  useEffect(() => {
    if (friendItems.length > 0) {
      const currentLastMessages = new Map<string, string>();
      friendItems.forEach(friend => {
        if (friend.lastMessageAt) {
          currentLastMessages.set(friend.friendId, friend.lastMessageAt);
        }
      });

      setClosedDMs(prev => {
        let changed = false;
        const newSet = new Set(prev);
        
        // Only re-open if lastMessageAt changed (new message received)
        friendItems.forEach(friend => {
          if (newSet.has(friend.friendId) && friend.lastMessageAt) {
            const prevLastMessage = prevLastMessagesRef.current.get(friend.friendId);
            // If lastMessageAt is different, it means a new message was received
            if (prevLastMessage !== friend.lastMessageAt) {
              newSet.delete(friend.friendId);
              changed = true;
            }
          }
        });
        
        if (changed) {
          try {
            localStorage.setItem(CLOSED_DMS_KEY, JSON.stringify(Array.from(newSet)));
          } catch (error) {
            console.error('Failed to save closed DMs:', error);
          }
        }
        
        prevLastMessagesRef.current = currentLastMessages;
        return changed ? newSet : prev;
      });
    }
  }, [friendItems]);

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    let inFlight = false;

    const refreshProfiles = async () => {
      if (inFlight) return;
      if (friendItems.length === 0) return;
      inFlight = true;

      const friendIds = friendItems.map((friend) => friend.friendId);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, imageurl, status, last_seen')
        .in('id', friendIds);

      inFlight = false;
      if (!active || !profiles) return;

      setFriendItems((prev) => {
        let hasChanges = false;
        const updated = prev.map((item) => {
          const profile: any = profiles.find((candidate: any) => candidate.id === item.friendId);
          if (!profile) return item;

          const displayStatus = normalizeStatus(profile.status, profile.last_seen);
          if (
            item.friend.username !== profile.username ||
            item.friend.imageurl !== profile.imageurl ||
            item.friend.status !== displayStatus ||
            item.friend.last_seen !== profile.last_seen
          ) {
            hasChanges = true;
            return {
              ...item,
              friend: {
                ...item.friend,
                username: profile.username,
                imageurl: profile.imageurl,
                status: displayStatus,
                last_seen: profile.last_seen,
              },
            };
          }

          return item;
        });

        return hasChanges ? updated : prev;
      });
    };

    const interval = setInterval(() => {
      void refreshProfiles();
    }, 2000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [friendItems]);

  const handleCloseDM = (friendId: string) => {
    // If currently viewing this DM, redirect to main DM page
    const match = pathname?.match(/^\/direct-messages\/([^\/]+)$/);
    if (match && match[1] === friendId) {
      router.push('/direct-messages');
    }

    setClosedDMs(prev => {
      const newSet = new Set(prev).add(friendId);
      try {
        localStorage.setItem(CLOSED_DMS_KEY, JSON.stringify(Array.from(newSet)));
      } catch (error) {
        console.error('Failed to save closed DMs:', error);
      }
      return newSet;
    });
  };

  // Get currently open DM from pathname
  const currentDMMatch = pathname?.match(/^\/direct-messages\/([^\/]+)$/);
  const currentDMId = currentDMMatch ? currentDMMatch[1] : null;

  // Filter visible friends: has messages AND not closed, OR currently viewing
  const visibleFriends = friendItems.filter(f => {
    const isClosed = closedDMs.has(f.friendId);
    const isCurrentlyOpen = f.friendId === currentDMId;
    const hasMessages = f.lastMessageAt != null;
    
    // Always show if currently viewing (even if no messages yet)
    if (isCurrentlyOpen) return true;
    
    // Otherwise, show only if has messages and not manually closed
    return hasMessages && !isClosed;
  });

  if (visibleFriends.length === 0) {
    return (
      <div className="px-2 py-4 text-sm text-drifd-muted text-center">
        Henüz mesaj yok
      </div>
    );
  }

  return (
    <>
      {visibleFriends.map((item) => {
        const statusColors = {
          online: 'bg-green-500',
          idle: 'bg-yellow-500',
          dnd: 'bg-red-500',
          offline: 'bg-transparent border-2 border-gray-500'
        };
        
        return (
          <div key={item.friendshipId} className="relative group">
            <Link
              href={`/direct-messages/${item.friendId}`}
              className="px-2 py-2 rounded hover:bg-drifd-hover cursor-pointer flex items-center gap-3"
            >
              <div className="relative flex-shrink-0">
                <div className="w-8 h-8 rounded-full bg-drifd-hover flex items-center justify-center overflow-hidden">
                  {item.friend.imageurl ? (
                    <img
                      src={item.friend.imageurl}
                      alt={item.friend.username}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xs font-bold text-white">
                      {getInitials(item.friend.username)}
                    </span>
                  )}
                </div>
                <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-drifd-secondary ${statusColors[(item.friend.status || 'offline') as keyof typeof statusColors]}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white truncate">{item.friend.username}</div>
              </div>
            </Link>
            {/* Close button - shown on hover */}
            <button
              onClick={(e) => {
                e.preventDefault();
                handleCloseDM(item.friendId);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-sm bg-drifd-secondary hover:bg-drifd-hover opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              title="Direkt Mesajı Kapat"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-drifd-muted hover:text-white">
                <path d="M18.4 4L12 10.4L5.6 4L4 5.6L10.4 12L4 18.4L5.6 20L12 13.6L18.4 20L20 18.4L13.6 12L20 5.6L18.4 4Z"/>
              </svg>
            </button>
          </div>
        );
      })}
    </>
  );
}
