'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  Phone,
  Volume2, 
  Trash2,
  Pin,
  Image as ImageIcon
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { getChatScopeKey } from '@/hooks/use-notification-preferences';
import { useChatMessageTools } from '@/hooks/use-chat-message-tools';
import { useMessageEngagement } from '@/hooks/chat/use-message-engagement';
import { useModalStore } from '@/hooks/use-modal-store';

interface AuthorInfo {
  username: string;
  avatarUrl: string | null;
  profileId: string;
}

interface ChatMessagesProps {
  messages: any[];
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  onLoadMore: () => void | Promise<unknown>;
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

function findAuthorByUsername(authorsByMemberId: Record<string, AuthorInfo>, username: string | null) {
  if (!username) return null;
  return Object.values(authorsByMemberId).find((author) => author.username === username) ?? null;
}

function parseReplyContent(content: string) {
  const match = content.match(/^>\s+([^:]+):\s+(.+)\n([\s\S]*)$/);
  if (!match) {
    return {
      replyAuthor: null,
      replySnippet: null,
      body: content,
      hasReply: false,
    };
  }

  return {
    replyAuthor: match[1]?.trim() || null,
    replySnippet: match[2]?.trim() || null,
    body: match[3] || '',
    hasReply: true,
  };
}

function parseForwardContent(content: string) {
  const match = content.match(/^\[İletildi\s+•\s+(.+?)\]\n([\s\S]*)$/);
  if (!match) {
    return {
      forwardAuthor: null,
      body: content,
      hasForward: false,
    };
  }

  return {
    forwardAuthor: match[1]?.trim() || null,
    body: match[2] || '',
    hasForward: true,
  };
}

function splitForwardBody(content: string) {
  const separatorIndex = content.indexOf('\n\n');
  if (separatorIndex === -1) {
    return {
      forwardedContent: content,
      noteBody: '',
    };
  }

  return {
    forwardedContent: content.slice(0, separatorIndex),
    noteBody: content.slice(separatorIndex + 2).trim(),
  };
}

function normalizeForMatch(value: string) {
  return value
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ')
    .trim();
}

export function ChatMessages({ messages, isFetchingNextPage, hasNextPage, onLoadMore, authorsByMemberId, channelId, isDM = false, currentProfileId, currentMemberRole }: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [dropdownMessageId, setDropdownMessageId] = useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<'top' | 'bottom'>('bottom');
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [pendingJumpMessageId, setPendingJumpMessageId] = useState<string | null>(null);
  const [pendingReplyJump, setPendingReplyJump] = useState<{ fromMessageId: string; replyAuthor: string; replySnippet: string } | null>(null);
  const processedUrlMessageRef = useRef<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const queryClient = useQueryClient();
  const queryKey = ['chat', channelId, isDM ? 'dm' : 'channel'];
  const scopeKey = getChatScopeKey(channelId, isDM);
  const setDraft = useChatMessageTools((state) => state.setDraft);
  const localTogglePinned = useChatMessageTools((state) => state.togglePinned);
  const localToggleReaction = useChatMessageTools((state) => state.toggleReaction);
  const pinnedByScope = useChatMessageTools((state) => state.pinnedByScope);
  const reactionsByMessage = useChatMessageTools((state) => state.reactionsByMessage);
  const { onOpen } = useModalStore();
  const {
    pinnedByMessage: channelPinnedByMessage,
    reactionsByMessage: channelReactionsByMessage,
    togglePin,
    toggleReaction,
  } = useMessageEngagement({
    channelId,
    isDM,
  });
  const useLocalEngagement = isDM;
  const activePinnedByMessage = isDM ? (pinnedByScope[scopeKey] || {}) : channelPinnedByMessage;
  const activeReactionsByMessage = isDM ? reactionsByMessage : channelReactionsByMessage;

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

  const clearMessageParamFromUrl = () => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has('message')) return;
    url.searchParams.delete('message');
    const nextPath = `${url.pathname}${url.search ? `?${url.searchParams.toString()}` : ''}${url.hash}`;
    window.history.replaceState({}, '', nextPath);
  };

  const jumpToMessage = (messageId: string, options?: { clearMessageParam?: boolean }) => {
    const target = messageRefs.current.get(messageId);
    if (!target) return false;

    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedMessageId(messageId);
    window.setTimeout(() => {
      setHighlightedMessageId((current) => (current === messageId ? null : current));
    }, 1800);

    if (options?.clearMessageParam) {
      clearMessageParamFromUrl();
    }

    return true;
  };

  const resolveReplyTargetId = useCallback((fromMessageId: string, replyAuthor: string, replySnippet: string) => {
    const normalizedAuthor = normalizeForMatch(replyAuthor);
    const normalizedSnippet = normalizeForMatch(replySnippet);
    if (!normalizedAuthor || !normalizedSnippet) return null;

    const fromIndex = messages.findIndex((item) => item.id === fromMessageId);
    const searchPool = fromIndex === -1 ? messages : messages.slice(0, fromIndex);
    const candidates = [...searchPool].reverse();

    for (const candidate of candidates) {
      const candidateRawContent = String(candidate.content || '');
      if (candidateRawContent.startsWith('[ENGAGEMENT]') || candidateRawContent === '[SYSTEM_PIN]') continue;

      const candidateAuthorId = isDM ? candidate.author_id : candidate.memberid;
      const candidateAuthorName = authorsByMemberId[candidateAuthorId]?.username || '';
      if (normalizeForMatch(candidateAuthorName) !== normalizedAuthor) continue;

      const candidateForward = parseForwardContent(candidateRawContent);
      const candidateBody = candidateForward.hasForward
        ? parseReplyContent(splitForwardBody(candidateForward.body).noteBody || '').body
        : parseReplyContent(candidateRawContent).body;

      const normalizedBody = normalizeForMatch(candidateBody || '');
      const normalizedRaw = normalizeForMatch(candidateRawContent);
      if (normalizedBody.includes(normalizedSnippet) || normalizedRaw.includes(normalizedSnippet)) {
        return String(candidate.id);
      }
    }

    return null;
  }, [authorsByMemberId, isDM, messages]);

  const handleReplyPreviewClick = useCallback((fromMessageId: string, replyAuthor: string | null, replySnippet: string | null) => {
    const author = replyAuthor?.trim();
    const snippet = replySnippet?.trim();
    if (!author || !snippet) return;

    const targetId = resolveReplyTargetId(fromMessageId, author, snippet);
    if (targetId) {
      const nextUrl = `${window.location.pathname}?message=${targetId}`;
      window.history.replaceState({}, '', nextUrl);
      window.dispatchEvent(new CustomEvent('drifd:go-to-message', {
        detail: { messageId: targetId },
      }));
      setPendingReplyJump(null);
      return;
    }

    if (hasNextPage) {
      setPendingReplyJump({
        fromMessageId,
        replyAuthor: author,
        replySnippet: snippet,
      });
    }
  }, [hasNextPage, resolveReplyTargetId]);

  useEffect(() => {
    const onJump = (event: Event) => {
      const customEvent = event as CustomEvent<{ messageId?: string }>;
      const messageId = customEvent.detail?.messageId;
      if (!messageId) return;
      const found = jumpToMessage(messageId, { clearMessageParam: true });
      if (!found && hasNextPage) {
        setPendingJumpMessageId(messageId);
      }
    };

    window.addEventListener('drifd:go-to-message', onJump);
    return () => {
      window.removeEventListener('drifd:go-to-message', onJump);
    };
  }, [hasNextPage, onLoadMore]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const urlMessageId = new URLSearchParams(window.location.search).get('message');
    if (!urlMessageId) return;
    if (processedUrlMessageRef.current === urlMessageId) return;

    processedUrlMessageRef.current = urlMessageId;
    const found = jumpToMessage(urlMessageId, { clearMessageParam: true });
    if (!found) {
      setPendingJumpMessageId(urlMessageId);
    }
  }, []);

  useEffect(() => {
    if (!pendingJumpMessageId) return;

    const found = jumpToMessage(pendingJumpMessageId, { clearMessageParam: true });
    if (found) {
      setPendingJumpMessageId(null);
      return;
    }

    if (!hasNextPage || isFetchingNextPage) {
      return;
    }

    void Promise.resolve(onLoadMore());
  }, [pendingJumpMessageId, hasNextPage, isFetchingNextPage, messages, onLoadMore]);

  useEffect(() => {
    if (!pendingReplyJump) return;

    const targetId = resolveReplyTargetId(
      pendingReplyJump.fromMessageId,
      pendingReplyJump.replyAuthor,
      pendingReplyJump.replySnippet,
    );

    if (targetId) {
      const nextUrl = `${window.location.pathname}?message=${targetId}`;
      window.history.replaceState({}, '', nextUrl);
      window.dispatchEvent(new CustomEvent('drifd:go-to-message', {
        detail: { messageId: targetId },
      }));
      setPendingReplyJump(null);
      return;
    }

    if (!hasNextPage || isFetchingNextPage) {
      return;
    }

    void Promise.resolve(onLoadMore());
  }, [pendingReplyJump, resolveReplyTargetId, hasNextPage, isFetchingNextPage, onLoadMore, messages]);

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

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[DELETE] Failed to delete message. Status:', response.status, 'Error:', errorText);
        return;
      }

      await response.json();

      // Invalidate and refetch the query to get the updated message
      await queryClient.invalidateQueries({ queryKey });

      setDropdownMessageId(null);
    } catch (error) {
      console.error('[DELETE] Error deleting message:', error);
    }
  };

  const handleSpeakMessage = (content: string) => {
    const speakable = parseReplyContent(content).body.trim();
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !speakable) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(speakable);
    utterance.lang = 'tr-TR';
    window.speechSynthesis.speak(utterance);
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
          const rawContent = String(message.content || '');

          // Hidden event rows that carry pin/reaction state when DB tables are unavailable.
          if (rawContent.startsWith('[ENGAGEMENT]')) {
            return null;
          }

          // System notification (e.g. pin event) — render inline, no full message card
          if ((message as any).system_type === 'pin') {
            return (
              <div key={message.id} className="flex items-center gap-2 px-2 py-0.5 text-xs text-[#949ba4]">
                <Pin className="h-3.5 w-3.5 flex-shrink-0 text-[#b9bbbe]" />
                <span>
                  <span className="font-semibold text-[#b9bbbe]">{(message as any).actor_name}</span>
                  {' bu kanala bir mesaj sabitledi. '}
                  <button
                    type="button"
                    onClick={() => window.dispatchEvent(new CustomEvent('drifd:open-pinned'))}
                    className="font-semibold text-[#b9bbbe] hover:underline"
                  >
                    Tüm sabitlenmiş mesajları gör.
                  </button>
                </span>
                <span className="ml-auto flex-shrink-0">{format(new Date(message.created_at), 'HH:mm')}</span>
              </div>
            );
          }

          // @ts-ignore - DM messages use author_id, channel messages use memberid
          const authorId = isDM ? message.author_id : message.memberid;
          const author = authorsByMemberId[authorId];
          const authorName = author?.username ?? (authorId || 'Unknown').slice(0, 8);

          // Persisted system pin notice row (shared with all users in channel)
          if (rawContent === '[SYSTEM_PIN]') {
            return (
              <div key={message.id} className="flex items-center gap-2 px-2 py-0.5 text-xs text-[#949ba4]">
                <Pin className="h-3.5 w-3.5 flex-shrink-0 text-[#b9bbbe]" />
                <span>
                  <span className="font-semibold text-[#b9bbbe]">{authorName}</span>
                  {' bu kanala bir mesaj sabitledi. '}
                  <button
                    type="button"
                    onClick={() => window.dispatchEvent(new CustomEvent('drifd:open-pinned'))}
                    className="font-semibold text-[#b9bbbe] hover:underline"
                  >
                    Tüm sabitlenmiş mesajları gör.
                  </button>
                </span>
                <span className="ml-auto flex-shrink-0">{format(new Date(message.created_at), 'HH:mm')}</span>
              </div>
            );
          }

          // DM call invite row
          if (isDM && rawContent.startsWith('[CALL_INVITE]')) {
            return (
              <div key={message.id} className="flex items-center gap-2 px-2 py-0.5 text-xs text-[#949ba4]">
                <Phone className="h-3.5 w-3.5 flex-shrink-0 text-[#57f287]" />
                <span>
                  <span className="font-semibold text-[#b9bbbe]">{authorName}</span>
                  {' bir arama başlattı.'}
                </span>
                <span className="ml-auto flex-shrink-0">{format(new Date(message.created_at), 'HH:mm')}</span>
              </div>
            );
          }

          if (isDM && rawContent.startsWith('[CALL_MISSED]')) {
            let durationText = 'birkaç saniye';
            try {
              const payload = JSON.parse(rawContent.slice('[CALL_MISSED]'.length)) as { durationSeconds?: number };
              if (typeof payload.durationSeconds === 'number' && payload.durationSeconds >= 60) {
                durationText = `${Math.max(1, Math.floor(payload.durationSeconds / 60))} dakika`;
              }
            } catch {
              // ignore malformed payload
            }

            return (
              <div key={message.id} className="flex items-center gap-2 px-2 py-0.5 text-xs text-[#949ba4]">
                <Phone className="h-3.5 w-3.5 flex-shrink-0 text-[#8e9297]" />
                <span className="min-w-0 truncate">
                  <span className="font-semibold text-[#dbdee1]">{authorName}</span>
                  {` kullanıcısından gelen ve ${durationText} süren bir cevapsız arama.`}
                </span>
                <span className="ml-auto flex-shrink-0">{format(new Date(message.created_at), 'HH:mm')}</span>
              </div>
            );
          }
          
          // Determine file type
          const fileUrl = message.fileurl;
          const isGif = fileUrl && (fileUrl.includes('tenor.com') || fileUrl.includes('giphy.com') || fileUrl.includes('klipy.com') || fileUrl.includes('.gif'));
          const isImage = fileUrl && !isGif && /\.(jpg|jpeg|png|webp|svg)$/i.test(fileUrl);
          const isVideo = fileUrl && /\.(mp4|webm|mov|avi)$/i.test(fileUrl);
          const isFile = fileUrl && !isGif && !isImage && !isVideo;
          const rawMessageContent = String(message.content || '');
          const parsedForward = parseForwardContent(rawMessageContent);
          const forwardParts = parsedForward.hasForward ? splitForwardBody(parsedForward.body) : null;
          const parsedForwardedContent = parsedForward.hasForward
            ? parseReplyContent(forwardParts?.forwardedContent || '')
            : null;
          const parsedMessage = parsedForward.hasForward
            ? parseReplyContent(forwardParts?.noteBody || '')
            : parseReplyContent(rawMessageContent);
          const messageBody = parsedForward.hasForward ? (forwardParts?.noteBody || '') : parsedMessage.body;
          const repliedAuthor = !parsedForward.hasForward
            ? findAuthorByUsername(authorsByMemberId, parsedMessage.replyAuthor)
            : null;
          const forwardedReplyAuthor = parsedForward.hasForward && parsedForwardedContent?.hasReply
            ? findAuthorByUsername(authorsByMemberId, parsedForwardedContent.replyAuthor)
            : null;
          const forwardedPreviewBase = parsedForward.hasForward
            ? (parsedForwardedContent?.hasReply
              ? (parsedForwardedContent.replySnippet || parsedForwardedContent.body || '')
              : (parsedForwardedContent?.body || ''))
            : '';
          const forwardedPreviewLine = forwardedPreviewBase.split('\n')[0]?.trim();
          const forwardedPreviewText = forwardedPreviewLine || (fileUrl ? 'Eki görmek için tıkla' : 'İletilen mesaj');
          const isOwnMessage = isDM ? message.author_id === currentProfileId : author?.profileId === currentProfileId;
          const isEdited = Boolean(
            message.updated_at
            && message.created_at
            && new Date(message.updated_at).getTime() - new Date(message.created_at).getTime() > 1000
          );
          
          // Check if user can delete this message
          const canDelete = isOwnMessage || (!isDM && (currentMemberRole === 'ADMIN' || currentMemberRole === 'MODERATOR'));
          const isPinned = Boolean(activePinnedByMessage[message.id]);
          const reactions = activeReactionsByMessage[message.id] || {};
          

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
              className={`group relative rounded-md px-2 py-2 hover:bg-drifd-secondary/40 ${
                highlightedMessageId === message.id ? 'bg-[#5865f2]/20 ring-1 ring-[#5865f2]/50' : ''
              }`}
              onMouseEnter={() => setHoveredMessageId(message.id)}
              onMouseLeave={() => setHoveredMessageId(null)}
            >
              {/* Hover Menu */}
              {hoveredMessageId === message.id && !message.deleted && (
                <div className="absolute -top-4 right-2 flex items-center gap-1 rounded-md border border-drifd-divider bg-[#2b2d31] px-2 py-1 shadow-lg z-10">
                  {quickReactions.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={async () => {
                        if (!currentProfileId) return;
                        if (useLocalEngagement) {
                          localToggleReaction(message.id, emoji, currentProfileId);
                          return;
                        }
                        const ok = await toggleReaction(message.id, emoji, currentProfileId);
                        if (!ok) {
                          localToggleReaction(message.id, emoji, currentProfileId);
                        }
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded hover:bg-drifd-hover transition-colors text-xl"
                      title="Add reaction"
                    >
                      {emoji}
                    </button>
                  ))}
                  <div className="w-px h-6 bg-drifd-divider mx-1" />
                  <button
                    onClick={() => handleDropdownToggle(message.id)}
                    className="flex h-8 w-8 items-center justify-center rounded hover:bg-drifd-hover transition-colors"
                    title="More"
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
                    onClick={async () => {
                      if (!currentProfileId) return;
                      const emoji = window.prompt('Emoji gir');
                      if (emoji) {
                        const cleanEmoji = emoji.trim();
                        if (!cleanEmoji) return;
                        if (useLocalEngagement) {
                          localToggleReaction(message.id, cleanEmoji, currentProfileId);
                          return;
                        }
                        const ok = await toggleReaction(message.id, cleanEmoji, currentProfileId);
                        if (!ok) {
                          localToggleReaction(message.id, cleanEmoji, currentProfileId);
                        }
                      }
                      setDropdownMessageId(null);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-drifd-text hover:bg-drifd-hover flex items-center gap-3"
                  >
                    <Smile className="h-4 w-4" />
                    Add Reaction
                  </button>
                  
                  {isOwnMessage && !message.deleted && (
                    <button
                      onClick={() => {
                        setDraft(scopeKey, {
                          mode: 'edit',
                          messageId: message.id,
                          authorName,
                          authorAvatarUrl: author?.avatarUrl || null,
                          content: message.content || '',
                          fileUrl: message.fileurl || null,
                        });
                        setDropdownMessageId(null);
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-drifd-text hover:bg-drifd-hover flex items-center gap-3"
                    >
                      <Edit2 className="h-4 w-4" />
                      Edit Message
                    </button>
                  )}
                  
                  <button
                    onClick={() => {
                      setDraft(scopeKey, {
                        mode: 'reply',
                        messageId: message.id,
                        authorName,
                        authorAvatarUrl: author?.avatarUrl || null,
                        content: message.content || '',
                        fileUrl: message.fileurl || null,
                      });
                      setDropdownMessageId(null);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-drifd-text hover:bg-drifd-hover flex items-center gap-3"
                  >
                    <Reply className="h-4 w-4" />
                    Yanıtla
                  </button>
                  
                  <button
                    onClick={() => {
                      onOpen('forwardMessage', {
                        forwardContent: message.content || '',
                        forwardFileUrl: message.fileurl || null,
                        forwardAuthorName: authorName,
                      });
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
                    onClick={async () => {
                      let pinnedAdded = false;
                      if (useLocalEngagement) {
                        const wasPinned = isPinned;
                        localTogglePinned(scopeKey, message.id);
                        pinnedAdded = !wasPinned;
                      } else {
                        pinnedAdded = await togglePin(message.id);
                      }

                      if (pinnedAdded && isDM) {
                        const currentUserEntry = Object.values(authorsByMemberId).find(
                          (a) => a.profileId === currentProfileId
                        );
                        const pinnerName = currentUserEntry?.username ?? 'Kullanıcı';
                        const sysMsg = {
                          id: `pin-notif-${Date.now()}`,
                          system_type: 'pin',
                          actor_name: pinnerName,
                          created_at: new Date().toISOString(),
                        };
                        queryClient.setQueryData<InfiniteData<any[]>>(queryKey, (prev) => {
                          if (!prev) return prev;
                          const pages = prev.pages.map((page) => [...page]);
                          pages[pages.length - 1] = [...pages[pages.length - 1], sysMsg];
                          return { ...prev, pages };
                        });
                      }
                      setDropdownMessageId(null);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-drifd-text hover:bg-drifd-hover flex items-center gap-3"
                  >
                    <Pin className="h-4 w-4" />
                    {isPinned ? 'Sabitleneni Kaldır' : 'Mesajı Sabitle'}
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
                      handleSpeakMessage(message.content || '');
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
                          handleDeleteMessage(message.id, channelId);
                        }}
                        className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-drifd-hover flex items-center gap-3"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete Message
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Discord-style Reply Preview — sits above the main row */}
              {!parsedForward.hasForward && parsedMessage.hasReply ? (
                <div
                  className="mb-1 flex items-center gap-2 text-xs cursor-pointer select-none"
                  onClick={() => handleReplyPreviewClick(String(message.id), parsedMessage.replyAuthor, parsedMessage.replySnippet)}
                  title="Yanıtlanan mesaja git"
                >
                  {/* Connector: covers avatar-column width (36px) + gap (12px) = 48px */}
                  <div className="relative h-[14px] w-[48px] flex-shrink-0">
                    <div className="absolute bottom-0 left-[15px] right-0 h-[11px] rounded-tl-[5px] border-l-2 border-t-2 border-[#4e5058]" />
                  </div>
                  {/* Replied-to user avatar */}
                  <div className="h-[18px] w-[18px] flex-shrink-0 overflow-hidden rounded-full bg-drifd-hover ring-1 ring-white/10">
                    {repliedAuthor?.avatarUrl ? (
                      <img src={repliedAuthor.avatarUrl} alt={parsedMessage.replyAuthor || ''} className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-[8px] font-bold text-white">
                        {getInitials(parsedMessage.replyAuthor || '?')}
                      </span>
                    )}
                  </div>
                  {/* @username */}
                  <span className="font-semibold text-[#dbdee1] hover:underline cursor-pointer whitespace-nowrap">
                    @{parsedMessage.replyAuthor}
                  </span>
                  {/* Image attachment icon */}
                  {parsedMessage.replySnippet === 'Eki görmek için tıkla' ? (
                    <ImageIcon className="h-3 w-3 flex-shrink-0 text-[#949ba4]" />
                  ) : null}
                  {/* Snippet */}
                  <span className="min-w-0 truncate text-[#949ba4]">{parsedMessage.replySnippet}</span>
                </div>
              ) : null}

              {/* Main message row */}
              <div className="flex gap-3 items-start">
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
                  {isEdited ? <span className="text-[11px] normal-case text-drifd-muted">(edited)</span> : null}
                  {isPinned ? <span className="rounded bg-drifd-hover px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-drifd-text">Pinned</span> : null}
                </div>

                {parsedForward.hasForward ? (
                  <div className="mb-2 flex items-start gap-2 text-xs">
                    <div className="mt-0.5 h-9 w-[2px] flex-shrink-0 rounded-full bg-[#4e5058]" />
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-1.5 text-[#949ba4]">
                        <Forward className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="italic">iletildi</span>
                        {parsedForward.forwardAuthor ? (
                          <span className="truncate text-[#b5bac1]">• {parsedForward.forwardAuthor}</span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[#b5bac1]">
                        {forwardedReplyAuthor ? (
                          <div className="h-3.5 w-3.5 flex-shrink-0 overflow-hidden rounded-full bg-drifd-hover">
                            {forwardedReplyAuthor.avatarUrl ? (
                              <img src={forwardedReplyAuthor.avatarUrl} alt={parsedForwardedContent?.replyAuthor || ''} className="h-full w-full object-cover" />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center text-[7px] font-bold text-white">
                                {getInitials(parsedForwardedContent?.replyAuthor || '?')}
                              </span>
                            )}
                          </div>
                        ) : null}
                        {forwardedPreviewText === 'Eki görmek için tıkla' ? (
                          <ImageIcon className="h-3 w-3 flex-shrink-0" />
                        ) : null}
                        <span className="min-w-0 truncate">{forwardedPreviewText}</span>
                      </div>
                    </div>
                  </div>
                ) : null}

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
                    {messageBody && (
                      <p className="mb-2 text-sm text-drifd-text [overflow-wrap:anywhere] whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: linkifyText(messageBody) }} />
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
                    {messageBody && (
                      <p className="mb-2 text-sm text-drifd-text [overflow-wrap:anywhere] whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: linkifyText(messageBody) }} />
                    )}
                    <video
                      src={fileUrl!}
                      controls
                      className="max-h-[400px] max-w-[500px] rounded-md"
                    />
                  </div>
                ) : isFile ? (
                  <div className="mt-2">
                    {messageBody && (
                      <p className="mb-2 text-sm text-drifd-text [overflow-wrap:anywhere] whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: linkifyText(messageBody) }} />
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
                  <p className="text-sm text-drifd-text [overflow-wrap:anywhere] whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: linkifyText(messageBody) }} />
                )}

                {Object.entries(reactions).length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Object.entries(reactions).map(([emoji, users]) => {
                      const reacted = currentProfileId ? users.includes(currentProfileId) : false;
                      return (
                        <button
                          type="button"
                          key={`${message.id}-${emoji}`}
                          onClick={async () => {
                            if (!currentProfileId) return;
                            if (useLocalEngagement) {
                              localToggleReaction(message.id, emoji, currentProfileId);
                              return;
                            }
                            const ok = await toggleReaction(message.id, emoji, currentProfileId);
                            if (!ok) {
                              localToggleReaction(message.id, emoji, currentProfileId);
                            }
                          }}
                          className={`rounded-full border px-2 py-1 text-xs transition-colors ${
                            reacted
                              ? 'border-drifd-primary bg-drifd-primary/20 text-white'
                              : 'border-drifd-divider bg-drifd-hover text-drifd-muted hover:text-white'
                          }`}
                        >
                          {emoji} {users.length}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
              </div>{/* end main message row */}
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
