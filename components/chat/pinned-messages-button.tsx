'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Pin, Reply, X } from 'lucide-react';
import { getChatScopeKey } from '@/hooks/use-notification-preferences';
import { useChatMessageTools } from '@/hooks/use-chat-message-tools';
import { useMessageEngagement } from '@/hooks/chat/use-message-engagement';
import { useChatQuery } from '@/hooks/chat/use-chat-query';
import { createClient } from '@/utils/supabase/client';

interface AuthorInfo {
  username: string;
  avatarUrl: string | null;
  profileId: string;
}

interface PinnedMessagesButtonProps {
  channelId: string;
  isDM?: boolean;
  authorsByMemberId?: Record<string, AuthorInfo>;
}

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

function parsePinnedContent(rawContent: string) {
  const content = String(rawContent || '');

  // Forward format: [İletildi • author]\n<forwarded content>\n\n<optional note>
  const forwardMatch = content.match(/^\[İletildi\s+•\s+(.+?)\]\n([\s\S]*)$/);
  if (forwardMatch) {
    const forwardAuthor = (forwardMatch[1] || '').trim() || null;
    const forwardedBody = forwardMatch[2] || '';
    const separatorIndex = forwardedBody.indexOf('\n\n');
    const forwardedPart = separatorIndex === -1 ? forwardedBody : forwardedBody.slice(0, separatorIndex);
    const notePart = separatorIndex === -1 ? '' : forwardedBody.slice(separatorIndex + 2).trim();

    const replyInsideForward = forwardedPart.match(/^>\s+([^:]+):\s+(.+)\n([\s\S]*)$/);
    if (replyInsideForward) {
      const replyAuthor = (replyInsideForward[1] || '').trim() || null;
      const replySnippet = (replyInsideForward[2] || '').trim();
      const replyBody = (replyInsideForward[3] || '').trim();
      const forwardedPreview = replySnippet || replyBody || 'İletilen mesaj';
      return {
        isForward: true,
        forwardAuthor,
        replyAuthor,
        forwardedPreview,
        noteText: notePart,
        displayText: notePart || forwardedPreview,
      };
    }

    const plainForwarded = forwardedPart.trim();
    const forwardedPreview = plainForwarded || 'İletilen mesaj';
    return {
      isForward: true,
      forwardAuthor,
      replyAuthor: null,
      forwardedPreview,
      noteText: notePart,
      displayText: notePart || forwardedPreview,
    };
  }

  // Reply format: > author: snippet\nbody
  const replyMatch = content.match(/^>\s+[^:]+:\s+.+\n([\s\S]*)$/);
  if (replyMatch) {
    const body = (replyMatch[1] || '').trim();
    return {
      isForward: false,
      forwardAuthor: null,
      replyAuthor: null,
      forwardedPreview: '',
      noteText: '',
      displayText: body,
    };
  }

  return {
    isForward: false,
    forwardAuthor: null,
    replyAuthor: null,
    forwardedPreview: '',
    noteText: '',
    displayText: content.trim(),
  };
}

export function PinnedMessagesButton({ channelId, isDM = false, authorsByMemberId = {} }: PinnedMessagesButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [remotePinnedMessages, setRemotePinnedMessages] = useState<Record<string, any>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const scopeKey = getChatScopeKey(channelId, isDM);
  const pinnedByScope = useChatMessageTools((state) => state.pinnedByScope);
  const reconcilePinnedScope = useChatMessageTools((state) => state.reconcilePinnedScope);
  const localTogglePinned = useChatMessageTools((state) => state.togglePinned);
  const { pinnedByMessage: channelPinnedByMessage, togglePin } = useMessageEngagement({ channelId, isDM });
  const { data } = useChatQuery({ channelId, isDM });
  const useLocalEngagement = isDM;
  const flatMessages = useMemo(() => data?.pages.flat() ?? [], [data?.pages]);

  useEffect(() => {
    const handler = () => setIsOpen(true);
    window.addEventListener('drifd:open-pinned', handler);
    return () => window.removeEventListener('drifd:open-pinned', handler);
  }, []);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isDM) return;
    const validMessageIds = flatMessages.map((message) => message.id as string).filter(Boolean);
    reconcilePinnedScope(scopeKey, validMessageIds);
  }, [isDM, flatMessages, reconcilePinnedScope, scopeKey]);

  useEffect(() => {
    if (isDM || !isOpen) return;

    const scopedPins = channelPinnedByMessage;
    const pinnedIds = Object.keys(scopedPins);
    if (pinnedIds.length === 0) {
      setRemotePinnedMessages((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }

    const existingIds = new Set(flatMessages.map((message) => String(message.id)));
    const loadedRemoteIds = new Set(Object.keys(remotePinnedMessages));
    const missingIds = pinnedIds.filter((id) => !existingIds.has(id) && !loadedRemoteIds.has(id));

    if (missingIds.length === 0) {
      // Drop stale cached remote rows that are no longer pinned.
      setRemotePinnedMessages((prev) => {
        const nextEntries = Object.entries(prev).filter(([id]) => pinnedIds.includes(id));
        if (nextEntries.length === Object.keys(prev).length) return prev;
        return Object.fromEntries(nextEntries);
      });
      return;
    }

    const supabase = createClient();
    const supabaseAny = supabase as any;

    void supabaseAny
      .from('messages')
      .select('*')
      .eq('channelid', channelId)
      .in('id', missingIds)
      .then(({ data }: { data?: any[] }) => {
        if (!data || data.length === 0) return;
        setRemotePinnedMessages((prev) => {
          const next = { ...prev };
          let changed = false;
          for (const row of data) {
            if (!row?.id) continue;
            const id = String(row.id);
            if (next[id] !== row) {
              next[id] = row;
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      })
      .catch(() => {
        // Silent fallback: popup will still show pinned items that are already in current chat pages.
      });
  }, [isDM, isOpen, channelPinnedByMessage, flatMessages, remotePinnedMessages, channelId]);

  const pinnedMessages = useMemo(() => {
    const scopedPins = useLocalEngagement ? (pinnedByScope[scopeKey] || {}) : channelPinnedByMessage;
    const mergedMap = new Map<string, any>();
    for (const message of flatMessages) {
      if (message?.id) mergedMap.set(String(message.id), message);
    }
    if (!useLocalEngagement) {
      for (const [id, message] of Object.entries(remotePinnedMessages)) {
        if (!mergedMap.has(id)) {
          mergedMap.set(id, message);
        }
      }
    }
    const flat = Array.from(mergedMap.values());

    return flat
      .filter((message) => scopedPins[message.id])
      .sort((left, right) => new Date(scopedPins[right.id]).getTime() - new Date(scopedPins[left.id]).getTime());
  }, [useLocalEngagement, pinnedByScope, scopeKey, channelPinnedByMessage, flatMessages, remotePinnedMessages]);

  const pinnedCount = pinnedMessages.length;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`relative flex h-8 w-8 items-center justify-center rounded-md transition-colors ${isOpen ? 'text-white' : 'text-drifd-muted hover:bg-drifd-hover hover:text-drifd-text'}`}
        title="Sabitlenen mesajlar"
      >
        <Pin className="h-5 w-5" />
        {isHydrated && pinnedCount > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#5865f2] text-[9px] font-bold text-white">
            {pinnedCount > 9 ? '9+' : pinnedCount}
          </span>
        )}
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-8 z-30 w-[420px] rounded-lg border border-[#1e1f22] bg-[#2b2d31] shadow-2xl">
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-[#1e1f22] px-4 py-3">
            <Pin className="h-4 w-4 text-drifd-muted" />
            <h3 className="text-sm font-semibold text-white">Sabitlenmiş Mesajlar</h3>
          </div>

          <div className="max-h-[540px] overflow-y-auto p-3 space-y-2">
            {pinnedMessages.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-3 py-12 text-center">
                <Pin className="h-10 w-10 text-drifd-muted/40" />
                <p className="text-sm text-drifd-muted">Henüz sabitlenen mesaj yok.</p>
              </div>
            ) : (
              pinnedMessages.map((message) => {
                const authorId = isDM ? message.author_id : message.memberid;
                const author = authorsByMemberId[authorId];
                const authorName = author?.username ?? (authorId ? String(authorId).slice(0, 8) : 'Kullanıcı');
                const rawContent = String(message.content || '');
                const parsed = parsePinnedContent(rawContent);
                const content = parsed.displayText || (message.fileurl ? '📎 Ekli dosya' : 'Boş mesaj');
                const repliedAuthor = findAuthorByUsername(authorsByMemberId, parsed.replyAuthor);

                return (
                  <div key={message.id} className="group rounded-md bg-[#1e1f22] p-3 hover:bg-[#232428] transition-colors">
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      <div className="h-9 w-9 flex-shrink-0 rounded-full bg-drifd-hover overflow-hidden">
                        {author?.avatarUrl ? (
                          <img src={author.avatarUrl} alt={authorName} className="h-full w-full object-cover" />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-xs font-bold text-white">
                            {getInitials(authorName)}
                          </span>
                        )}
                      </div>

                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="flex items-baseline gap-2 min-w-0 flex-wrap">
                            <span className="text-sm font-semibold text-white truncate">{authorName}</span>
                            <span className="text-[11px] text-drifd-muted flex-shrink-0">
                              {format(new Date(message.created_at), 'dd.MM.yyyy HH:mm')}
                            </span>
                          </div>
                          {/* Git + X buttons */}
                          <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={() => {
                                const nextUrl = `${window.location.pathname}?message=${message.id}`;
                                window.history.replaceState({}, '', nextUrl);
                                window.dispatchEvent(new CustomEvent('drifd:go-to-message', {
                                  detail: { messageId: message.id },
                                }));
                                setIsOpen(false);
                              }}
                              className="rounded px-2 py-0.5 text-xs font-semibold bg-[#3c3f45] text-drifd-text hover:bg-[#4e525a] transition-colors"
                            >
                              Git
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                if (useLocalEngagement) {
                                  localTogglePinned(scopeKey, message.id);
                                  return;
                                }
                                await togglePin(message.id);
                              }}
                              className="flex h-6 w-6 items-center justify-center rounded text-drifd-muted hover:bg-[#3c3f45] hover:text-white transition-colors"
                              title="Sabitlemeyi kaldır"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {parsed.isForward ? (
                          <div className="mb-2 rounded border-l-2 border-[#4f545c] pl-2.5">
                            <div className="flex items-center gap-1.5 text-[12px] text-[#949ba4]">
                              <Reply className="h-3.5 w-3.5" />
                              <span className="italic">iletildi</span>
                              {parsed.forwardAuthor ? <span>• {parsed.forwardAuthor}</span> : null}
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-[#b5bac1]">
                              {repliedAuthor ? (
                                <div className="h-4 w-4 overflow-hidden rounded-full bg-drifd-hover">
                                  {repliedAuthor.avatarUrl ? (
                                    <img src={repliedAuthor.avatarUrl} alt={parsed.replyAuthor || ''} className="h-full w-full object-cover" />
                                  ) : (
                                    <span className="flex h-full w-full items-center justify-center text-[8px] font-bold text-white">
                                      {getInitials(parsed.replyAuthor || '?')}
                                    </span>
                                  )}
                                </div>
                              ) : null}
                              <span className="truncate">{parsed.forwardedPreview}</span>
                            </div>
                          </div>
                        ) : null}

                        {/* Message content */}
                        <p className="text-sm text-drifd-text [overflow-wrap:anywhere] whitespace-pre-wrap line-clamp-4">
                          {content}
                        </p>

                        {/* File/image preview */}
                        {message.fileurl && /\.(jpg|jpeg|png|webp|gif)$/i.test(message.fileurl) && (
                          <img
                            src={message.fileurl}
                            alt="Ek"
                            className="mt-2 max-h-40 rounded object-contain"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}