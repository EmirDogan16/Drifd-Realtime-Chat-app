'use client';

import { useState } from 'react';
import { ChatRoom } from '@/components/chat/chat-room';
import { MemberPanel } from '@/components/server/member-panel';

interface MemberItem {
  id: string;
  profileId: string;
  role: 'ADMIN' | 'MODERATOR' | 'GUEST';
  username: string;
  imageurl: string | null;
  status?: 'online' | 'idle' | 'dnd' | 'offline';
}

interface ChannelLayoutClientProps {
  channelId: string;
  channelName: string;
  memberId: string;
  authorsByMemberId: Record<string, { username: string; avatarUrl: string | null }>;
  channelType: 'TEXT' | 'AUDIO' | 'VIDEO';
  isAdmin: boolean;
  serverId: string;
  members: MemberItem[];
}

export function ChannelLayoutClient({
  channelId,
  channelName,
  memberId,
  authorsByMemberId,
  channelType,
  isAdmin,
  serverId,
  members,
}: ChannelLayoutClientProps) {
  const [showMemberPanel, setShowMemberPanel] = useState(true);

  return (
    <div className="flex h-screen w-full bg-drifd-tertiary overflow-hidden">
      <section className="flex-1 overflow-hidden">
        <ChatRoom
          channelId={channelId}
          channelName={channelName}
          memberId={memberId}
          authorsByMemberId={authorsByMemberId}
          channelType={channelType}
          isAdmin={isAdmin}
          serverId={serverId}
          showMemberPanel={showMemberPanel}
          onToggleMemberPanel={() => setShowMemberPanel(!showMemberPanel)}
        />
      </section>
      {showMemberPanel && <MemberPanel members={members} serverId={serverId} />}
    </div>
  );
}
