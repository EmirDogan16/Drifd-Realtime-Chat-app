'use client';

import { useMemo, useState, useEffect } from 'react';
import { ChatHeader } from '@/components/chat/chat-header';
import { ChatInput } from '@/components/chat/chat-input';
import { ChatMessages } from '@/components/chat/chat-messages';
import { useChatQuery } from '@/hooks/chat/use-chat-query';
import { useChatSocket } from '@/hooks/chat/use-chat-socket';
import { createClient } from '@/utils/supabase/client';

interface ChatRoomProps {
  channelId: string;
  channelName: string;
  memberId: string;
  authorsByMemberId: Record<string, { username: string; avatarUrl: string | null; profileId: string }>;
  channelType?: 'TEXT' | 'AUDIO' | 'VIDEO';
  isAdmin?: boolean;
  serverId?: string;
  showMemberPanel?: boolean;
  onToggleMemberPanel?: () => void;
}

export function ChatRoom({ 
  channelId, 
  channelName, 
  memberId, 
  authorsByMemberId: initialAuthors,
  channelType = 'TEXT',
  isAdmin = false,
  serverId,
  showMemberPanel,
  onToggleMemberPanel
}: ChatRoomProps) {
  const { data, hasNextPage, fetchNextPage, isFetchingNextPage } = useChatQuery({ channelId });
  const [authorsByMemberId, setAuthorsByMemberId] = useState(initialAuthors);
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(null);
  const [currentMemberRole, setCurrentMemberRole] = useState<'ADMIN' | 'MODERATOR' | 'GUEST' | null>(null);

  useChatSocket({ channelId, serverId, notificationTitle: `#${channelName}`, currentSenderId: memberId });

  // Get current user profile ID and role
  useEffect(() => {
    const getProfileId = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentProfileId(user.id);
        
        // Get member role for current user in this server
        if (serverId) {
          const { data: memberData, error } = await supabase
            .from('members')
            .select('role')
            .eq('serverid', serverId)
            .eq('profileid', user.id)
            .maybeSingle();
          
          if (memberData && !error) {
            const role = (memberData as any).role;
            setCurrentMemberRole(role as 'ADMIN' | 'MODERATOR' | 'GUEST');
          }
        }
      }
    };
    getProfileId();
  }, [serverId]);

  // Process messages first, before using them in effects
  const messages = useMemo(() => {
    const flat = data?.pages.flat() ?? [];
    
    // Deduplicate by ID, keeping the most recently updated version
    const messageMap = new Map();
    flat.forEach(msg => {
      const existing = messageMap.get(msg.id);
      if (!existing) {
        messageMap.set(msg.id, msg);
      } else {
        // Keep the message with the latest updated_at timestamp
        const existingTime = new Date(existing.updated_at || existing.created_at).getTime();
        const newTime = new Date(msg.updated_at || msg.created_at).getTime();
        if (newTime >= existingTime) {
          messageMap.set(msg.id, msg);
        }
      }
    });
    
    const deduped = Array.from(messageMap.values());
    
    // Separate real and optimistic messages
    const realMessages: any[] = [];
    const optimisticMessages: any[] = [];
    
    deduped.forEach(msg => {
      if (msg.id.startsWith('optimistic-')) {
        optimisticMessages.push(msg);
      } else {
        realMessages.push(msg);
      }
    });
    
    // Filter out optimistic messages that have corresponding real messages (same content within 10s)
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

  // Polling mechanism to refresh profile data periodically
  useEffect(() => {
    const supabase = createClient();
    
    const refreshProfiles = async () => {
      // Get all unique member IDs from messages
      const memberIds = new Set<string>();
      messages.forEach(msg => {
        if ('memberid' in msg && msg.memberid) {
          memberIds.add(msg.memberid);
        }
      });

      if (memberIds.size === 0) return;
      
      // Fetch member data with profiles
      const { data: members } = await supabase
        .from('members')
        .select('id, profileid')
        .in('id', Array.from(memberIds));
      
      if (!members || members.length === 0) return;
      
      const profileIds = members.map((m: any) => m.profileid);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, imageurl')
        .in('id', profileIds);
      
      if (!profiles) return;
      
      // Build updated authors map
      const updatedAuthors: Record<string, { username: string; avatarUrl: string | null; profileId: string }> = {};
      members.forEach((member: any) => {
        const profile: any = profiles.find((p: any) => p.id === member.profileid);
        if (profile) {
          updatedAuthors[member.id] = {
            username: profile.username,
            avatarUrl: profile.imageurl,
            profileId: profile.id
          };
        }
      });
      
      // Update state if there are changes
      const changedAuthors: Record<string, { username: string; avatarUrl: string | null; profileId: string }> = {};
      Object.keys(updatedAuthors).forEach(memberId => {
        const current = authorsByMemberId[memberId];
        const updated = updatedAuthors[memberId];
        if (!current || current.username !== updated.username || current.avatarUrl !== updated.avatarUrl || current.profileId !== updated.profileId) {
          changedAuthors[memberId] = updated;
        }
      });
      
      if (Object.keys(changedAuthors).length > 0) {
        setAuthorsByMemberId(prev => ({
          ...prev,
          ...changedAuthors
        }));
      }
    };
    
    // Initial refresh
    refreshProfiles();
    
    // Poll every 1 second for fast updates
    const interval = setInterval(refreshProfiles, 1000);
    
    return () => {
      clearInterval(interval);
    };
  }, [messages]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <ChatHeader 
        channelName={channelName}
        channelId={channelId}
        showMemberPanel={showMemberPanel}
        onToggleMemberPanel={onToggleMemberPanel}
        authorsByMemberId={authorsByMemberId}
      />
      <ChatMessages
        messages={messages}
        isFetchingNextPage={isFetchingNextPage}
        hasNextPage={Boolean(hasNextPage)}
        onLoadMore={() => void fetchNextPage()}
        authorsByMemberId={authorsByMemberId}
        channelId={channelId}
        currentProfileId={currentProfileId || undefined}
        currentMemberRole={currentMemberRole || undefined}
      />
      <ChatInput channelId={channelId} memberId={memberId} />
    </div>
  );
}
