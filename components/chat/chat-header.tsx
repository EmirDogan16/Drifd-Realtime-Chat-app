'use client';

interface ChatHeaderProps {
  channelName: string;
  showMemberPanel?: boolean;
  onToggleMemberPanel?: () => void;
}

export function ChatHeader({ channelName, showMemberPanel = true, onToggleMemberPanel }: ChatHeaderProps) {
  return (
    <header className="flex h-12 items-center justify-between border-b border-drifd-divider px-4 flex-shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-drifd-muted">#</span>
        <span className="text-sm font-bold text-white">{channelName}</span>
      </div>
      <div className="flex items-center gap-4">
        {/* Notification Bell */}
        <button className="text-drifd-muted hover:text-drifd-text transition-colors">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/>
          </svg>
        </button>

        {/* Pinned Messages */}
        <button className="text-drifd-muted hover:text-drifd-text transition-colors">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z"/>
          </svg>
        </button>

        {/* Members List Toggle */}
        <button 
          onClick={onToggleMemberPanel}
          className={`transition-colors ${
            showMemberPanel 
              ? 'text-drifd-text' 
              : 'text-drifd-muted hover:text-drifd-text'
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
