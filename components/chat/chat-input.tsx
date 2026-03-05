'use client';

import { useState } from 'react';
import EmojiPicker, { Theme, type EmojiClickData } from 'emoji-picker-react';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Plus, Smile, BarChart3 } from 'lucide-react';
import { GifPicker } from '@/components/chat/gif-picker';
import { createClient } from '@/utils/supabase/client';
import { useModalStore } from '@/hooks/use-modal-store';

const messageSchema = z.object({
  content: z.string().trim().min(1, 'Message cannot be empty').max(2000, 'Message is too long'),
});

type MessageFormValues = z.infer<typeof messageSchema>;

interface ChatInputProps {
  channelId: string;
  memberId?: string;
  isDM?: boolean;
  currentProfileId?: string;
}

export function ChatInput({ channelId, memberId, isDM = false, currentProfileId }: ChatInputProps) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [sending, setSending] = useState(false);
  const queryClient = useQueryClient();
  const { onOpen } = useModalStore();
  const form = useForm<MessageFormValues>({
    resolver: zodResolver(messageSchema),
    defaultValues: {
      content: '',
    },
  });

  const content = form.watch('content');
  const isDemoMode = channelId.startsWith('demo-');

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
    
    if (isDM) {
      const insertPayload = {
        dm_channel_id: channelId,
        content: gifUrl,
        profileid: currentProfileId,
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
        const { data: updateData, error: updateError } = await supabase
          .from('dm_channels')
          .update({ last_message_at: new Date().toISOString() } as any)
          .eq('id', channelId)
          .select();
        if (updateError) {
          console.error('[ChatInput] Error updating dm_channels:', updateError);
        }
        // Dispatch event to refresh DM list
        window.dispatchEvent(new CustomEvent('dmMessageSent', { detail: { channelId } }));
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
    form.reset({ content: '' });
    setSending(true);

    const optimistic: any = isDM
      ? {
          id: `optimistic-${Date.now()}`,
          dm_channel_id: channelId,
          content: messageContent,
          created_at: new Date().toISOString(),
          deleted: false,
          fileurl: null,
          author_id: currentProfileId,
          updated_at: new Date().toISOString(),
        }
      : {
          id: `optimistic-${Date.now()}`,
          channelid: channelId,
          content: messageContent,
          created_at: new Date().toISOString(),
          deleted: false,
          fileurl: null,
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
    
    if (isDM) {
      const insertPayload = {
        dm_channel_id: channelId,
        content: messageContent,
        author_id: currentProfileId,
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
        const { data: updateData, error: updateError } = await supabase
          .from('dm_channels')
          .update({ last_message_at: new Date().toISOString() } as any)
          .eq('id', channelId)
          .select();
        if (updateError) {
          console.error('[ChatInput] Error updating dm_channels:', updateError);
        }
        // Dispatch event to refresh DM list
        window.dispatchEvent(new CustomEvent('dmMessageSent', { detail: { channelId } }));
        // Don't remove optimistic - let real-time subscription handle it
      }
    } else {
      const insertPayload = {
        channelid: channelId,
        content: messageContent,
        memberid: memberId!,
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

    setSending(false);
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="relative border-t border-drifd-divider p-4 flex-shrink-0">
      <div className="flex items-center gap-3 rounded-lg bg-drifd-hover px-4 py-3">
        {/* Plus Button - File Upload */}
        <button
          type="button"
          onClick={() => onOpen('uploadFile', { channelId, memberId })}
          className="flex h-6 w-6 items-center justify-center rounded-full text-drifd-muted transition-colors hover:bg-drifd-secondary hover:text-white"
          title="Dosya Ekle"
        >
          <Plus className="h-5 w-5" />
        </button>

        {/* Poll Button */}
        <button
          type="button"
          onClick={() => onOpen('createPoll', { channelId, memberId })}
          className="flex h-6 w-6 items-center justify-center rounded-full text-drifd-muted transition-colors hover:bg-drifd-secondary hover:text-white"
          title="Anket Oluştur"
        >
          <BarChart3 className="h-5 w-5" />
        </button>

        {/* Message Input */}
        <input
          {...form.register('content')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              form.handleSubmit(onSubmit)();
            }
          }}
          className="flex-1 bg-transparent text-sm text-drifd-text outline-none placeholder:text-drifd-muted"
          placeholder="Mesaj gönder..."
        />

        {/* GIF Button */}
        <button
          type="button"
          onClick={() => {
            setShowGifPicker((prev) => !prev);
            setShowEmojiPicker(false);
          }}
          className="px-2 text-sm font-semibold text-drifd-muted transition-colors hover:text-white"
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
          className="flex h-6 w-6 items-center justify-center rounded text-drifd-muted transition-colors hover:text-white"
          title="Emoji"
        >
          <Smile className="h-5 w-5" />
        </button>
      </div>
      {isDemoMode ? <p className="mt-2 text-xs text-drifd-muted">Demo kanalda mesaj gönderimi kapalı.</p> : null}
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
