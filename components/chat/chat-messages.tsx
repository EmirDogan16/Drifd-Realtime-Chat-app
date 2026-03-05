'use client';

import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { PollMessage } from './poll-message';
import twemoji from 'twemoji';
import { 
  Smile, 
  MoreVertical, 
  Edit2, 
  Reply, 
  Forward, 
  Copy, 
  Link, 
  Volume2, 
  Trash2,
  Pin
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';

interface AuthorInfo {
  username: string;
  avatarUrl: string | null;
  profileId: string;
}

interface ChatMessagesProps {
  messages: any[];
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  onLoadMore: () => void;
  authorsByMemberId: Record<string, AuthorInfo>;
  channelId: string;
  isDM?: boolean;
  currentProfileId?: string;
  currentMemberRole?: 'ADMIN' | 'MODERATOR' | 'GUEST';
}

// Convert emojis to Twemoji images (same as Discord)
function parseEmoji(text: string): string {
  return twemoji.parse(text, {
    folder: 'svg',
    ext: '.svg',
    base: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/'
  });
}

// Convert URLs in text to clickable links and emojis to images
function linkifyText(text: string): string {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  
  // First escape HTML to prevent XSS
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
  
  // Convert URLs to links
  const withLinks = escaped.replace(urlRegex, (url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-drifd-link underline hover:text-drifd-link/80 transition-colors">${url}</a>`;
  });
  
  // Convert emojis to Twemoji images
  return parseEmoji(withLinks);
}

// Get initials from username
function getInitials(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const [first, second] = trimmed.split(/\s+/).filter(Boolean).slice(0, 2);
  return `${first?.[0] ?? ''}${second?.[0] ?? ''}`.toUpperCase() || trimmed[0]?.toUpperCase() || '?';
}

export function ChatMessages({ messages, isFetchingNextPage, hasNextPage, onLoadMore, authorsByMemberId, channelId, isDM = false, currentProfileId, currentMemberRole }: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [dropdownMessageId, setDropdownMessageId] = useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<'top' | 'bottom'>('bottom');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const queryClient = useQueryClient();
  const queryKey = ['chat', channelId, isDM ? 'dm' : 'channel'];

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Initial scroll to bottom on mount
  useEffect(() => {
    if (messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' });
    }
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownMessageId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const quickReactions = ['😂', '✅', '❤️', '⭐'];

  const handleDropdownToggle = (messageId: string) => {
    if (dropdownMessageId === messageId) {
      setDropdownMessageId(null);
      return;
    }

    // Calculate dropdown position
    const messageElement = messageRefs.current.get(messageId);
    if (messageElement) {
      const rect = messageElement.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom;
      
      // If less than 300px space below, open upwards
      setDropdownPosition(spaceBelow < 300 ? 'top' : 'bottom');
    }
    
    setDropdownMessageId(messageId);
  };

  const handleDeleteMessage = async (messageId: string, channelId: string) => {
    console.log('[DELETE] Starting delete for messageId:', messageId, 'channelId:', channelId, 'isDM:', isDM);
    try {
      const response = await fetch('/api/messages/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId,
          channelId,
          isDM
        })
      });

      console.log('[DELETE] Response status:', response.status, response.ok);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[DELETE] Failed to delete message. Status:', response.status, 'Error:', errorText);
        return;
      }

      const result = await response.json();
      console.log('[DELETE] Delete successful:', result);

      // Invalidate and refetch the query to get the updated message
      await queryClient.invalidateQueries({ queryKey });
      console.log('[DELETE] Cache invalidated');

      setDropdownMessageId(null);
    } catch (error) {
      console.error('[DELETE] Error deleting message:', error);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      {hasNextPage ? (
        <button
          onClick={onLoadMore}
          disabled={isFetchingNextPage}
          className="mb-4 rounded-md border border-drifd-divider px-3 py-1 text-xs text-drifd-muted hover:bg-drifd-hover disabled:opacity-50"
        >
          {isFetchingNextPage ? 'Loading...' : 'Load older messages'}
        </button>
      ) : null}

      <div className="space-y-3">
        {messages.map((message) => {
          // @ts-ignore - DM messages use author_id, channel messages use memberid
          const authorId = isDM ? message.author_id : message.memberid;
          const author = authorsByMemberId[authorId];
          const authorName = author?.username ?? (authorId || 'Unknown').slice(0, 8);
          
          // Determine file type
          const fileUrl = message.fileurl;
          const isGif = fileUrl && (fileUrl.includes('tenor.com') || fileUrl.includes('giphy.com') || fileUrl.includes('klipy.com') || fileUrl.includes('.gif'));
          const isImage = fileUrl && !isGif && /\.(jpg|jpeg|png|webp|svg)$/i.test(fileUrl);
          const isVideo = fileUrl && /\.(mp4|webm|mov|avi)$/i.test(fileUrl);
          const isFile = fileUrl && !isGif && !isImage && !isVideo;
          const isOwnMessage = isDM ? message.author_id === currentProfileId : author?.profileId === currentProfileId;
          
          // Check if user can delete this message
          const canDelete = isOwnMessage || (!isDM && (currentMemberRole === 'ADMIN' || currentMemberRole === 'MODERATOR'));
          
          // Debug permission for mrmonica's message
          if (authorName === 'mrmonica') {
            console.log('[PERMISSION] mrmonica message:', {
              messageId: message.id.substring(0, 8),
              isOwnMessage,
              currentMemberRole,
              isDM,
              canDelete
            });
          }

          return (
            <div 
              key={message.id}
              ref={(el) => {
                if (el) {
                  messageRefs.current.set(message.id, el);
                } else {
                  messageRefs.current.delete(message.id);
                }
              }}
              className="group relative flex gap-3 rounded-md px-2 py-2 hover:bg-drifd-secondary/40"
              onMouseEnter={() => setHoveredMessageId(message.id)}
              onMouseLeave={() => setHoveredMessageId(null)}
            >
              {/* Hover Menu */}
              {hoveredMessageId === message.id && !message.deleted && (
                <div className="absolute -top-4 right-2 flex items-center gap-1 rounded-md border border-drifd-divider bg-[#2b2d31] px-2 py-1 shadow-lg z-10">
                  {quickReactions.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => {
                        // TODO: Add reaction functionality
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded hover:bg-drifd-hover transition-colors text-xl"
                      title="Tepki ekle"
                    >
                      {emoji}
                    </button>
                  ))}
                  <div className="w-px h-6 bg-drifd-divider mx-1" />
                  <button
                    onClick={() => handleDropdownToggle(message.id)}
                    className="flex h-8 w-8 items-center justify-center rounded hover:bg-drifd-hover transition-colors"
                    title="Daha fazla"
                  >
                    <MoreVertical className="h-5 w-5 text-drifd-muted" />
                  </button>
                </div>
              )}

              {/* Dropdown Menu */}
              {dropdownMessageId === message.id && !message.deleted && (
                <div 
                  ref={dropdownRef}
                  className={`absolute ${dropdownPosition === 'top' ? 'bottom-12' : 'top-8'} right-2 w-56 rounded-md border border-drifd-divider bg-[#2b2d31] py-2 shadow-xl z-20`}
                >
                  <button
                    onClick={() => {
                      // TODO: Add reaction modal
                      setDropdownMessageId(null);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-drifd-text hover:bg-drifd-hover flex items-center gap-3"
                  >
                    <Smile className="h-4 w-4" />
                    Tepki Ekle
                  </button>
                  
                  {isOwnMessage && !message.deleted && (
                    <button
                      onClick={() => {
                        // TODO: Edit message functionality
                        setDropdownMessageId(null);
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-drifd-text hover:bg-drifd-hover flex items-center gap-3"
                    >
                      <Edit2 className="h-4 w-4" />
                      Mesajı Düzenle
                    </button>
                  )}
                  
                  <button
                    onClick={() => {
                      // TODO: Reply functionality
                      setDropdownMessageId(null);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-drifd-text hover:bg-drifd-hover flex items-center gap-3"
                  >
                    <Reply className="h-4 w-4" />
                    Yanıtla
                  </button>
                  
                  <button
                    onClick={() => {
                      // TODO: Forward functionality
                      setDropdownMessageId(null);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-drifd-text hover:bg-drifd-hover flex items-center gap-3"
                  >
                    <Forward className="h-4 w-4" />
                    İlet
                  </button>
                  
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(message.content);
                      setDropdownMessageId(null);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-drifd-text hover:bg-drifd-hover flex items-center gap-3"
                  >
                    <Copy className="h-4 w-4" />
                    Metni Kopyala
                  </button>
                  
                  <button
                    onClick={() => {
                      // TODO: Pin message functionality
                      setDropdownMessageId(null);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-drifd-text hover:bg-drifd-hover flex items-center gap-3"
                  >
                    <Pin className="h-4 w-4" />
                    Mesajı Sabitle
                  </button>
                  
                  <button
                    onClick={() => {
                      const url = `${window.location.origin}${window.location.pathname}?message=${message.id}`;
                      navigator.clipboard.writeText(url);
                      setDropdownMessageId(null);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-drifd-text hover:bg-drifd-hover flex items-center gap-3"
                  >
                    <Link className="h-4 w-4" />
                    Mesaj Bağlantısını Kopyala
                  </button>
                  
                  <button
                    onClick={() => {
                      // TODO: Text-to-speech functionality
                      setDropdownMessageId(null);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-drifd-text hover:bg-drifd-hover flex items-center gap-3"
                  >
                    <Volume2 className="h-4 w-4" />
                    Mesajı Söylet
                  </button>
                  
                  {canDelete && !message.deleted && (
                    <>
                      <div className="my-1 h-px bg-drifd-divider" />
                      <button
                        onClick={() => {
                          console.log('[BUTTON] Delete button clicked for message:', message.id, 'author:', authorName);
                          handleDeleteMessage(message.id, channelId);
                        }}
                        className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-drifd-hover flex items-center gap-3"
                      >
                        <Trash2 className="h-4 w-4" />
                        Mesajı Sil
                      </button>
                    </>
                  )}
                </div>
              )}

              <div className="relative h-9 w-9 flex-shrink-0 rounded-full bg-drifd-hover">
                {author?.avatarUrl ? (
                  <img src={author.avatarUrl} alt={authorName} className="h-full w-full rounded-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center rounded-full text-xs font-bold text-white">
                    {getInitials(authorName)}
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2 text-[11px] text-drifd-muted">
                  <span className="text-sm font-semibold text-white">{authorName}</span>
                  <span>{format(new Date(message.created_at), 'dd/MM/yyyy HH:mm')}</span>
                </div>
                
                {/* Deleted message */}
                {message.deleted ? (
                  <div className="flex items-center gap-2 text-sm text-drifd-muted/70 italic">
                    <span className="px-2 py-1 rounded bg-drifd-secondary/30 border border-drifd-divider/50">
                      {message.content}
                    </span>
                  </div>
                ) : /* Poll Message */
                message.poll_data && currentProfileId ? (
                  <PollMessage
                    messageId={message.id}
                    channelId={message.channelid}
                    pollData={message.poll_data}
                    currentUserId={currentProfileId}
                  />
                ) : isGif || isImage ? (
                  <div className="mt-2">
                    {message.content && (
                      <p className="mb-2 text-sm text-drifd-text break-words" dangerouslySetInnerHTML={{ __html: linkifyText(message.content) }} />
                    )}
                    <img
                      src={fileUrl!}
                      alt="Medya"
                      className="max-h-[400px] max-w-[500px] rounded-md object-contain cursor-pointer hover:opacity-90"
                      onClick={() => window.open(fileUrl!, '_blank')}
                    />
                  </div>
                ) : isVideo ? (
                  <div className="mt-2">
                    {message.content && (
                      <p className="mb-2 text-sm text-drifd-text break-words" dangerouslySetInnerHTML={{ __html: linkifyText(message.content) }} />
                    )}
                    <video
                      src={fileUrl!}
                      controls
                      className="max-h-[400px] max-w-[500px] rounded-md"
                    />
                  </div>
                ) : isFile ? (
                  <div className="mt-2">
                    {message.content && (
                      <p className="mb-2 text-sm text-drifd-text break-words" dangerouslySetInnerHTML={{ __html: linkifyText(message.content) }} />
                    )}
                    <a
                      href={fileUrl!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-md bg-[#2b2d31] p-3 hover:bg-[#1e1f22] transition-colors"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded bg-[#5865f2]">
                        <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#00a8fc] hover:underline truncate">
                          {fileUrl.split('/').pop()?.split('?')[0] || 'Dosya'}
                        </p>
                        <p className="text-xs text-[#b5bac1]">İndirmek için tıklayın</p>
                      </div>
                    </a>
                  </div>
                ) : (
                  <p className="text-sm text-drifd-text break-words" dangerouslySetInnerHTML={{ __html: linkifyText(message.content) }} />
                )}
              </div>
            </div>
          );
        })}

        {messages.length === 0 ? <p className="text-sm text-drifd-muted">No messages yet.</p> : null}
      </div>
      
      {/* Invisible element to scroll to */}
      <div ref={bottomRef} />
    </div>
  );
}
