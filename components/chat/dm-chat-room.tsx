'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import { useChatQuery } from '@/hooks/chat/use-chat-query';
import { useChatSocket } from '@/hooks/chat/use-chat-socket';
import { ChatMessages } from '@/components/chat/chat-messages';
import { ChatInput } from '@/components/chat/chat-input';
import { createClient } from '@/utils/supabase/client';

interface DMChatRoomProps {
  dmChannelId: string;
  friendUsername: string;
  friendAvatar: string | null;
  currentUserId: string;
  friendId: string;
}

export function DMChatRoom({ dmChannelId, friendUsername: initialFriendUsername, friendAvatar: initialFriendAvatar, currentUserId, friendId }: DMChatRoomProps) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useChatQuery({
    channelId: dmChannelId,
    isDM: true,
  });

  const [friendUsername, setFriendUsername] = useState(initialFriendUsername);
  const [friendAvatar, setFriendAvatar] = useState(initialFriendAvatar);
  const [currentUserProfile, setCurrentUserProfile] = useState<{ username: string; avatarUrl: string | null }>({ username: '', avatarUrl: null });

  // Enable real-time updates for DM messages
  useChatSocket({
    channelId: dmChannelId,
    isDM: true,
    notificationTitle: friendUsername || 'Direkt Mesaj',
    currentSenderId: currentUserId,
  });

  // Fetch current user profile
  useEffect(() => {
    const supabase = createClient();
    
    const fetchCurrentUser = async () => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('username, imageurl')
        .eq('id', currentUserId)
        .single();
      
      if (profile) {
        setCurrentUserProfile({
          username: (profile as any).username,
          avatarUrl: (profile as any).imageurl
        });
      }
    };
    
    fetchCurrentUser();
  }, [currentUserId]);

  // Keep profile cards fresh with light polling
  useEffect(() => {
    const supabase = createClient();
    let active = true;
    let inFlight = false;
    
    const refreshProfiles = async () => {
      if (inFlight) return;
      inFlight = true;
      // Refresh both current user and friend profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, imageurl')
        .in('id', [currentUserId, friendId]);

      inFlight = false;
      
      if (!active || !profiles) return;
      
      profiles.forEach((profile: any) => {
        if (profile.id === currentUserId) {
          setCurrentUserProfile(prev => {
            if (prev.username !== profile.username || prev.avatarUrl !== profile.imageurl) {
              return { username: profile.username, avatarUrl: profile.imageurl };
            }
            return prev;
          });
        } else if (profile.id === friendId) {
          if (friendUsername !== profile.username || friendAvatar !== profile.imageurl) {
            setFriendUsername(profile.username);
            setFriendAvatar(profile.imageurl);
          }
        }
      });
    };
    
    void refreshProfiles();
    const interval = setInterval(() => {
      void refreshProfiles();
    }, 15000);
    
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [currentUserId, friendId]);

  // Update friend profile only when props change
  useEffect(() => {
    setFriendUsername(initialFriendUsername);
    setFriendAvatar(initialFriendAvatar);
  }, [initialFriendUsername, initialFriendAvatar]);

  const messages = useMemo(() => {
    const flat = data?.pages.flat() ?? [];
    
    // First pass: Deduplicate by ID only (remove exact duplicates)
    const seenIds = new Set();
    const deduped = flat.filter(msg => {
      if (seenIds.has(msg.id)) return false;
      seenIds.add(msg.id);
      return true;
    });
    
    const sorted = [...deduped].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    
    // Second pass: Remove optimistic messages that have corresponding real messages
    const realMessages: any[] = [];
    const optimisticMessages: any[] = [];
    
    sorted.forEach(msg => {
      if (msg.id.startsWith('optimistic-')) {
        optimisticMessages.push(msg);
      } else {
        realMessages.push(msg);
      }
    });
    
    // Filter out optimistic messages that match real messages (same content within 10s)
    const finalOptimistic = optimisticMessages.filter(optMsg => {
      const optTime = new Date(optMsg.created_at).getTime();
      
      // Check if there's a real message with same content
      const hasRealMatch = realMessages.some(realMsg => {
        if (realMsg.content !== optMsg.content) return false;
        const realTime = new Date(realMsg.created_at).getTime();
        const timeDiff = Math.abs(realTime - optTime);
        return timeDiff <= 10000; // Within 10 seconds
      });
      
      return !hasRealMatch; // Keep only if no real match found
    });
    
    // Combine real + filtered optimistic
    const combined = [...realMessages, ...finalOptimistic];
    
    return combined.sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }, [data?.pages]);

  // Create author mapping for DM messages (by profileid instead of memberid)
  const authorsByProfileId = useMemo(() => {
    // For DMs, we only have two participants
    return {
      [currentUserId]: { username: currentUserProfile.username, avatarUrl: currentUserProfile.avatarUrl, profileId: currentUserId },
      [friendId]: { username: friendUsername, avatarUrl: friendAvatar, profileId: friendId },
    };
  }, [currentUserId, friendId, friendUsername, friendAvatar, currentUserProfile]);

  return (
    <div className="flex flex-col flex-1 h-full overflow-hidden">
      <ChatMessages
        messages={messages as any}
        isFetchingNextPage={isFetchingNextPage}
        hasNextPage={Boolean(hasNextPage)}
        onLoadMore={() => void fetchNextPage()}
        authorsByMemberId={authorsByProfileId}
        channelId={dmChannelId}
        isDM={true}
        currentProfileId={currentUserId}
      />
      <ChatInput channelId={dmChannelId} isDM={true} currentProfileId={currentUserId} dmFriendId={friendId} />
    </div>
  );
}
