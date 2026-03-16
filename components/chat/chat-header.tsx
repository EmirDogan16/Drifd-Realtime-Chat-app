'use client';

import { NotificationToggleButton } from '@/components/chat/notification-toggle-button';
import { PinnedMessagesButton } from '@/components/chat/pinned-messages-button';

interface AuthorInfo {
  username: string;
  avatarUrl: string | null;
  profileId: string;
}

interface ChatHeaderProps {
  channelName: string;
  channelId: string;
  showMemberPanel?: boolean;
  onToggleMemberPanel?: () => void;
  authorsByMemberId?: Record<string, AuthorInfo>;
}

export function ChatHeader({ channelName, channelId, showMemberPanel = true, onToggleMemberPanel, authorsByMemberId }: ChatHeaderProps) {
  return (
    <header className="flex h-12 items-center justify-between border-b border-drifd-divider px-4 flex-shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-drifd-muted">#</span>
        <span className="text-sm font-bold text-white">{channelName}</span>
      </div>
      <div className="flex items-center gap-4">
        <NotificationToggleButton channelId={channelId} />
        <PinnedMessagesButton channelId={channelId} authorsByMemberId={authorsByMemberId} />

        {/* Members List Toggle */}
        <button 
          onClick={onToggleMemberPanel}
          className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
            showMemberPanel 
              ? 'text-drifd-text hover:bg-drifd-hover' 
              : 'text-drifd-muted hover:bg-drifd-hover hover:text-drifd-text'
          }`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
          </svg>
        </button>
      </div>
    </header>
  );
}
