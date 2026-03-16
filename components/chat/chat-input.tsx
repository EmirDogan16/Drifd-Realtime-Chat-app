
'use client';

import { useEffect, useRef, useState } from 'react';
import EmojiPicker, { Theme, type EmojiClickData } from 'emoji-picker-react';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Plus, Smile, BarChart3, Reply } from 'lucide-react';
import { GifPicker } from '@/components/chat/gif-picker';
import { createClient } from '@/utils/supabase/client';
import { useModalStore } from '@/hooks/use-modal-store';
import { getChatScopeKey } from '@/hooks/use-notification-preferences';
import { buildForwardPrefix, buildReplyPrefix, useChatMessageTools } from '@/hooks/use-chat-message-tools';

const messageSchema = z.object({
  content: z.string().trim().min(1, 'Message cannot be empty').max(2000, 'Message is too long'),
});

type MessageFormValues = z.infer<typeof messageSchema>;

interface ChatInputProps {
  channelId: string;
  memberId?: string;
  isDM?: boolean;
  currentProfileId?: string;
  dmFriendId?: string;
}

function splitMessageForEditing(content: string) {
  const replyMatch = content.match(/^(>\s+[^:]+:\s+.+)\n([\s\S]*)$/);
  if (replyMatch) {
    return {
      prefix: replyMatch[1],
      body: replyMatch[2] || '',
    };
  }

  const forwardMatch = content.match(/^(\[İletildi\s+•\s+.+\])\n([\s\S]*)$/);
  if (forwardMatch) {
    return {
      prefix: forwardMatch[1],
      body: forwardMatch[2] || '',
    };
  }

  return {
    prefix: '',
    body: content,
  };
}

function getInitials(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const [first, second] = trimmed.split(/\s+/).filter(Boolean).slice(0, 2);
  return `${first?.[0] ?? ''}${second?.[0] ?? ''}`.toUpperCase() || trimmed[0]?.toUpperCase() || '?';
}

function getDraftPreviewText(draft: NonNullable<ReturnType<typeof useChatMessageTools.getState>['drafts'][string]>) {
  const body = splitMessageForEditing(draft.content).body.trim();
  if (body) return body;
  if (draft.fileUrl) return 'Eki görmek için tıkla';
  return 'Boş mesaj';
}

export function ChatInput({ channelId, memberId, isDM = false, currentProfileId, dmFriendId }: ChatInputProps) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [sending, setSending] = useState(false);
  const queryClient = useQueryClient();
  const { onOpen } = useModalStore();
  const scopeKey = getChatScopeKey(channelId, isDM);
  const draft = useChatMessageTools((state) => state.drafts[scopeKey]);
  const clearDraft = useChatMessageTools((state) => state.clearDraft);
  const form = useForm<MessageFormValues>({
    resolver: zodResolver(messageSchema),
    defaultValues: {
      content: '',
    },
  });

  const content = form.watch('content');
  const isDemoMode = channelId.startsWith('demo-');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { ref: registerRef, ...registerRest } = form.register('content');

  // Auto-resize textarea whenever content changes
  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    const nextHeight = Math.max(32, Math.min(textareaRef.current.scrollHeight, 168));
    textareaRef.current.style.height = `${nextHeight}px`;
  }, [content]);

  useEffect(() => {
    if (!draft) return;

    if (draft.mode === 'edit') {
      form.setValue('content', splitMessageForEditing(draft.content).body, { shouldValidate: true });
      setTimeout(() => form.setFocus('content'), 0);
    }

    if (draft.mode === 'forward') {
      const forwardSeed = draft.content || 'İletilen mesaj';
      form.setValue('content', forwardSeed, { shouldValidate: true });
      setTimeout(() => form.setFocus('content'), 0);
    }
  }, [draft, form]);

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    const currentContent = form.getValues('content') || '';
    const nextValue = `${currentContent}${emojiData.emoji}`;
    form.setValue('content', nextValue, { shouldValidate: true });
    setShowEmojiPicker(false);
    // Use form.setFocus to properly focus the registered input
    setTimeout(() => {
      form.setFocus('content');
    }, 0);
  };

  const handleGifSelect = async (gifUrl: string) => {
    if (sending || isDemoMode) return;

    setSending(true);
    setShowGifPicker(false);

    const optimistic: any = isDM
      ? {
          id: `optimistic-${Date.now()}`,
          dm_channel_id: channelId,
          content: gifUrl,
          created_at: new Date().toISOString(),
          deleted: false,
          fileurl: gifUrl,
          author_id: currentProfileId,
          updated_at: new Date().toISOString(),
        }
      : {
          id: `optimistic-${Date.now()}`,
          channelid: channelId,
          content: gifUrl,
          created_at: new Date().toISOString(),
          deleted: false,
          fileurl: gifUrl,
          memberid: memberId,
          updated_at: new Date().toISOString(),
        };

    const queryKey = ['chat', channelId, isDM ? 'dm' : 'channel'];
    queryClient.setQueryData<InfiniteData<any[]>>(queryKey, (prev) => {
      if (!prev) {
        return { pageParams: [0], pages: [[optimistic]] };
      }
      const pages = prev.pages.map((page) => [...page]);
      const last = pages.length - 1;
      pages[last] = [...pages[last], optimistic];
      return { ...prev, pages };
    });

    const supabase = createClient();
    const supabaseAny = supabase as any;
    
    if (isDM) {
      const insertPayload = {
        dm_channel_id: channelId,
        content: gifUrl,
        author_id: currentProfileId,
        fileurl: gifUrl,
        deleted: false,
      };
      const { data, error } = await supabase.schema('public').from('dm_channel_messages').insert(insertPayload as any).select();
      if (error) {
        console.error('[ChatInput] Error sending DM GIF:', error);
        console.error('[ChatInput] DM GIF Error details - message:', error.message, 'code:', error.code, 'details:', error.details);
        queryClient.setQueryData<InfiniteData<any[]>>(queryKey, (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            pages: prev.pages.map((page) => page.filter((item) => item.id !== optimistic.id)),
          };
        });
      } else {
        // Update dm_channels last_message_at immediately (don't wait for trigger)
        const { data: updateData, error: updateError } = await supabaseAny
          .from('dm_channels')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', channelId)
          .select();
        if (updateError) {
          console.error('[ChatInput] Error updating dm_channels:', updateError);
        }
        // Dispatch event so DM list can update immediately without waiting for full refresh.
        window.dispatchEvent(new CustomEvent('dmMessageSent', { detail: { channelId, friendId: dmFriendId } }));
      }
    } else {
      const insertPayload = {
        channelid: channelId,
        content: gifUrl,
        memberid: memberId!,
        fileurl: gifUrl,
        deleted: false,
      };
      const { data, error } = await supabase.schema('public').from('messages').insert(insertPayload as any).select();
      if (error) {
        console.error('[ChatInput] Error sending channel GIF:', error);
        console.error('[ChatInput] Channel GIF Error details - message:', error.message, 'code:', error.code, 'details:', error.details);
        queryClient.setQueryData<InfiniteData<any[]>>(queryKey, (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            pages: prev.pages.map((page) => page.filter((item) => item.id !== optimistic.id)),
          };
        });
      }
    }

    setSending(false);
  };

  const onSubmit = async (values: MessageFormValues) => {
    if (sending || isDemoMode) return;

    const messageContent = values.content.trim();
    const timestamp = new Date().toISOString();

    if (draft?.mode === 'edit') {
      setSending(true);
      const supabase = createClient();
      const supabaseAny = supabase as any;
      const tableName = isDM ? 'dm_channel_messages' : 'messages';
      const original = splitMessageForEditing(draft.content);
      const editedContent = original.prefix ? `${original.prefix}\n${messageContent}` : messageContent;

      queryClient.setQueryData<InfiniteData<any[]>>(['chat', channelId, isDM ? 'dm' : 'channel'], (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          pages: prev.pages.map((page) => page.map((item) => (
            item.id === draft.messageId
              ? { ...item, content: editedContent, updated_at: timestamp }
              : item
          ))),
        };
      });

      const { error } = await supabaseAny
        .from(tableName)
        .update({ content: editedContent, updated_at: timestamp })
        .eq('id', draft.messageId);

      if (error) {
        console.error('[ChatInput] Error editing message:', error);
      }

      clearDraft(scopeKey);
      form.reset({ content: '' });
      setSending(false);
      return;
    }

    const finalContent = draft?.mode === 'reply'
      ? `${buildReplyPrefix(draft)}\n${messageContent}`
      : draft?.mode === 'forward'
        ? `${buildForwardPrefix(draft)}\n${messageContent}`
        : messageContent;

    form.reset({ content: '' });
    setSending(true);

    const optimistic: any = isDM
      ? {
          id: `optimistic-${Date.now()}`,
          dm_channel_id: channelId,
          content: finalContent,
          created_at: new Date().toISOString(),
          deleted: false,
          fileurl: draft?.mode === 'forward' ? draft.fileUrl || null : null,
          author_id: currentProfileId,
          updated_at: new Date().toISOString(),
        }
      : {
          id: `optimistic-${Date.now()}`,
          channelid: channelId,
          content: finalContent,
          created_at: new Date().toISOString(),
          deleted: false,
          fileurl: draft?.mode === 'forward' ? draft.fileUrl || null : null,
          memberid: memberId,
          updated_at: new Date().toISOString(),
        };

    const queryKey = ['chat', channelId, isDM ? 'dm' : 'channel'];
    queryClient.setQueryData<InfiniteData<any[]>>(queryKey, (prev) => {
      if (!prev) {
        return { pageParams: [0], pages: [[optimistic]] };
      }
      const pages = prev.pages.map((page) => [...page]);
      const last = pages.length - 1;
      pages[last] = [...pages[last], optimistic];
      return { ...prev, pages };
    });

    const supabase = createClient();
    const supabaseAny = supabase as any;
    
    if (isDM) {
      const insertPayload = {
        dm_channel_id: channelId,
        content: finalContent,
        author_id: currentProfileId,
        fileurl: draft?.mode === 'forward' ? draft.fileUrl || null : null,
        deleted: false,
      };

      const { data, error } = await supabase.schema('public').from('dm_channel_messages').insert(insertPayload as any).select();
      if (error) {
        console.error('[ChatInput] Error sending DM message:', error);
        console.error('[ChatInput] DM Error details - message:', error.message, 'code:', error.code, 'details:', error.details);
        queryClient.setQueryData<InfiniteData<any[]>>(queryKey, (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            pages: prev.pages.map((page) => page.filter((item) => item.id !== optimistic.id)),
          };
        });
      } else {
        // Update dm_channels last_message_at immediately (don't wait for trigger)
        const { data: updateData, error: updateError } = await supabaseAny
          .from('dm_channels')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', channelId)
          .select();
        if (updateError) {
          console.error('[ChatInput] Error updating dm_channels:', updateError);
        }
        // Dispatch event so DM list can update immediately without waiting for full refresh.
        window.dispatchEvent(new CustomEvent('dmMessageSent', { detail: { channelId, friendId: dmFriendId } }));
        // Don't remove optimistic - let real-time subscription handle it
      }
    } else {
      const insertPayload = {
        channelid: channelId,
        content: finalContent,
        memberid: memberId!,
        fileurl: draft?.mode === 'forward' ? draft.fileUrl || null : null,
        deleted: false,
      };
      const { data, error } = await supabase.schema('public').from('messages').insert(insertPayload as any).select();
      if (error) {
        console.error('[ChatInput] Error sending channel message:', error);
        console.error('[ChatInput] Error details - message:', error.message, 'code:', error.code, 'details:', error.details);
        queryClient.setQueryData<InfiniteData<any[]>>(queryKey, (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            pages: prev.pages.map((page) => page.filter((item) => item.id !== optimistic.id)),
          };
        });
      }
    }

    if (draft) {
      clearDraft(scopeKey);
    }

    setSending(false);
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="relative border-t border-drifd-divider p-4 flex-shrink-0">
      {draft ? (
        <div className="mb-3 flex items-start justify-between rounded-md border border-drifd-divider bg-[#2b2d31] text-sm">
          <div className="min-w-0 flex-1">
            <div className="border-b border-drifd-divider px-4 py-2 font-semibold text-white">
              {draft.mode === 'reply' ? `${draft.authorName} kişisine yanıt veriliyor` : draft.mode === 'edit' ? 'Mesaj düzenleniyor' : 'Mesaj iletiliyor'}
            </div>
            <div className="flex items-center gap-3 px-4 py-3">
              {draft.mode === 'reply' ? (
                <div className="flex min-w-0 items-center gap-2">
                  {/* Reply icon */}
                  <Reply className="h-4 w-4 flex-shrink-0 text-[#5865f2]" />
                  {/* Replied-to user avatar */}
                  <div className="h-5 w-5 flex-shrink-0 overflow-hidden rounded-full bg-drifd-hover ring-1 ring-white/10">
                    {draft.authorAvatarUrl ? (
                      <img src={draft.authorAvatarUrl} alt={draft.authorName} className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-[10px] font-bold text-white">
                        {getInitials(draft.authorName)}
                      </span>
                    )}
                  </div>
                  <span className="flex-shrink-0 font-semibold text-[#dbdee1]">@{draft.authorName}</span>
                  <span className="min-w-0 truncate text-[#949ba4]">{getDraftPreviewText(draft)}</span>
                </div>
              ) : (
                <div className="min-w-0 truncate text-drifd-muted">
                  {draft.authorName}: {getDraftPreviewText(draft)}
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => clearDraft(scopeKey)}
            className="m-2 flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium text-drifd-muted hover:bg-drifd-hover hover:text-white"
          >
            Vazgeç
          </button>
        </div>
      ) : null}

      <div className="flex items-center gap-3 rounded-lg bg-drifd-hover px-4 py-3">
        {/* Plus Button - File Upload */}
        <button
          type="button"
          onClick={() => onOpen('uploadFile', { channelId, memberId })}
          className="flex h-8 w-8 items-center justify-center rounded-md text-drifd-muted transition-colors hover:bg-drifd-secondary hover:text-white"
          title="Add File"
        >
          <Plus className="h-5 w-5" />
        </button>

        {/* Poll Button */}
        {!isDM ? (
          <button
            type="button"
            onClick={() => onOpen('createPoll', { channelId, memberId })}
            className="flex h-8 w-8 items-center justify-center rounded-md text-drifd-muted transition-colors hover:bg-drifd-secondary hover:text-white"
            title="Create Poll"
          >
            <BarChart3 className="h-5 w-5" />
          </button>
        ) : null}

        {/* Message Input */}
        <div className="relative flex-1">
          <textarea
            {...registerRest}
            ref={(el) => {
              registerRef(el);
              (textareaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
            }}
            rows={1}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                form.handleSubmit(onSubmit)();
              }
            }}
            className="w-full bg-transparent text-sm text-drifd-text outline-none placeholder:text-drifd-muted resize-none overflow-y-auto leading-5 py-1.5"
            style={{ maxHeight: '168px' }}
            placeholder={draft?.mode === 'edit' ? 'Mesajı düzenle...' : 'Send a message...'}
          />
          {content?.length > 1800 ? (
            <span className={`absolute -top-5 right-0 text-[11px] font-medium ${
              content.length >= 2000 ? 'text-red-400' : content.length > 1900 ? 'text-yellow-400' : 'text-drifd-muted'
            }`}>
              {content.length}/2000
            </span>
          ) : null}
        </div>

        {/* GIF Button */}
        <button
          type="button"
          onClick={() => {
            setShowGifPicker((prev) => !prev);
            setShowEmojiPicker(false);
          }}
          className="inline-flex h-8 items-center justify-center rounded-md px-2 text-sm font-semibold text-drifd-muted transition-colors hover:bg-drifd-secondary hover:text-white"
          title="GIF"
        >
          GIF
        </button>

        {/* Emoji Button */}
        <button
          type="button"
          onClick={() => {
            setShowEmojiPicker((prev) => !prev);
            setShowGifPicker(false);
          }}
          className="flex h-8 w-8 items-center justify-center rounded-md text-drifd-muted transition-colors hover:bg-drifd-secondary hover:text-white"
          title="Emoji"
        >
          <Smile className="h-5 w-5" />
        </button>
      </div>
      {isDemoMode ? <p className="mt-2 text-xs text-drifd-muted">Messaging is disabled in demo channels.</p> : null}
      {form.formState.errors.content?.message ? (
        <p className="mt-2 text-xs text-red-400">{form.formState.errors.content.message}</p>
      ) : null}

      {showEmojiPicker && (
        <div className="absolute bottom-16 right-4 z-20">
          <EmojiPicker onEmojiClick={handleEmojiClick} width={320} height={380} theme={Theme.DARK} />
        </div>
      )}

      {showGifPicker && <GifPicker onClose={() => setShowGifPicker(false)} onSelect={handleGifSelect} />}
    </form>
  );
}
