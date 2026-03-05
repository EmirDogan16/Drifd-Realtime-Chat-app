'use client';

import { useEffect, useRef } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { createClient } from '@/utils/supabase/client';
import type { Database } from '@/types/supabase';

type MessageRow = Database['public']['Tables']['messages']['Row'];
type DMMessageRow = Database['public']['Tables']['dm_channel_messages']['Row'];

interface UseChatSocketOptions {
  channelId: string;
  isDM?: boolean;
}

function isMessageRow(value: unknown): value is MessageRow {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<MessageRow>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.channelid === 'string' &&
    typeof candidate.content === 'string' &&
    typeof candidate.memberid === 'string'
  );
}

function extractMessageId(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as { id?: unknown };
  return typeof candidate.id === 'string' ? candidate.id : null;
}

export function useChatSocket({ channelId, isDM = false }: UseChatSocketOptions) {
  const queryClient = useQueryClient();
  const lastMessageIdRef = useRef<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const tableName = isDM ? 'dm_channel_messages' : 'messages';
    const filterField = isDM ? 'dm_channel_id' : 'channelid';
    const queryKey = ['chat', channelId, isDM ? 'dm' : 'channel'];
    
    // AbortController to cancel ongoing requests on cleanup
    const abortController = new AbortController();
    let isActive = true;

    const upsertMessage = (message: MessageRow | DMMessageRow) => {
      queryClient.setQueryData<InfiniteData<(MessageRow | DMMessageRow)[]>>(queryKey, (prev) => {
        if (!prev) {
          return { pageParams: [0], pages: [[message]] };
        }

        let messageFound = false;
        const pages = prev.pages.map((page) => {
          const hasMessage = page.some((item) => item.id === message.id);
          if (hasMessage) {
            messageFound = true;
            return page.map((item) => (item.id === message.id ? message : item));
          }
          return page;
        });

        // If message not found in any page, add to last page
        if (!messageFound) {
          const lastPageIndex = pages.length - 1;
          pages[lastPageIndex] = [...pages[lastPageIndex], message];
        }

        return { ...prev, pages };
      });
    };

    const removeMessage = (messageId: string) => {
      queryClient.setQueryData<InfiniteData<(MessageRow | DMMessageRow)[]>>(queryKey, (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          pages: prev.pages.map((page) => page.filter((message) => message.id !== messageId)),
        };
      });
    };

    // POLLING: Check for new messages every 300ms
    const pollInterval = setInterval(async () => {
      if (!isActive || abortController.signal.aborted) return;
      
      try {
        const query = isDM
          ? supabase
              .from('dm_channel_messages')
              .select('*')
              .eq('dm_channel_id', channelId)
              .order('created_at', { ascending: false })
              .limit(1)
          : supabase
              .from('messages')
              .select('*')
              .eq('channelid', channelId)
              .order('created_at', { ascending: false })
              .limit(1);

        const { data, error } = await query;

        if (!isActive) return;

        if (error) {
          // PGRST116 means no rows found, which is not an error
          if ((error as any).code === 'PGRST116') {
            return;
          }
          
          // Stop polling on critical errors (channel deleted, access denied, etc.)
          clearInterval(pollInterval);
          return;
        }

        if (data && data.length > 0) {
          const latestMessage = data[0];
          
          // If this is a new message (different ID than last seen)
          if (lastMessageIdRef.current !== latestMessage.id) {
            lastMessageIdRef.current = latestMessage.id;
            upsertMessage(latestMessage as MessageRow | DMMessageRow);
          }
        }
      } catch (err) {
        if (!isActive) return;
        console.error('[useChatSocket] Polling exception:', err);
      }
    }, 300); // Poll every 300ms

    // HEARTBEAT: Check for message updates (deleted, edited) every 2 seconds
    const heartbeatInterval = setInterval(async () => {
      if (!isActive || abortController.signal.aborted) return;
      
      try {
        const query = isDM
          ? supabase
              .from('dm_channel_messages')
              .select('*')
              .eq('dm_channel_id', channelId)
              .order('created_at', { ascending: false })
              .limit(20) // Check last 20 messages for updates
          : supabase
              .from('messages')
              .select('*')
              .eq('channelid', channelId)
              .order('created_at', { ascending: false })
              .limit(20); // Check last 20 messages for updates

        const { data, error } = await query;

        if (!isActive) return;

        if (error) {
          if ((error as any).code === 'PGRST116') {
            return;
          }
          clearInterval(heartbeatInterval);
          return;
        }

        if (data && data.length > 0) {
          // Update all messages in cache (including deleted ones)
          data.forEach((message) => {
            upsertMessage(message as MessageRow | DMMessageRow);
          });
        }
      } catch (err) {
        if (!isActive) return;
        console.error('[useChatSocket] Heartbeat exception:', err);
      }
    }, 2000); // Check every 2 seconds

    // Also try WebSocket subscription (as fallback/enhancement)
    const channel = supabase.channel(`chat:${channelId}`);

    channel
      .on(
        'postgres_changes',
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: tableName
        },
        (payload: RealtimePostgresChangesPayload<MessageRow | DMMessageRow>) => {
          const newRow = payload.new as any;
          const rowChannelId = isDM ? newRow?.dm_channel_id : newRow?.channelid;
          
          if (rowChannelId === channelId) {
            if (payload.new && typeof payload.new === 'object') {
              lastMessageIdRef.current = (payload.new as any).id;
              upsertMessage(payload.new as MessageRow | DMMessageRow);
            }
          }
        },
      )
      .on(
        'postgres_changes',
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: tableName
        },
        (payload: RealtimePostgresChangesPayload<MessageRow | DMMessageRow>) => {
          const newRow = payload.new as any;
          const rowChannelId = isDM ? newRow?.dm_channel_id : newRow?.channelid;
          
          if (rowChannelId === channelId) {
            if (payload.new && typeof payload.new === 'object') {
              upsertMessage(payload.new as MessageRow | DMMessageRow);
            }
          }
        },
      )
      .on(
        'postgres_changes',
        { 
          event: 'DELETE', 
          schema: 'public', 
          table: tableName
        },
        (payload: RealtimePostgresChangesPayload<MessageRow | DMMessageRow>) => {
          const oldRow = payload.old as any;
          const rowChannelId = isDM ? oldRow?.dm_channel_id : oldRow?.channelid;
          
          if (rowChannelId === channelId) {
            const id = extractMessageId(payload.old);
            if (id) {
              removeMessage(id);
            }
          }
        },
      )
      .subscribe((status) => {
        // Silently handle connection status - polling is already working
      });

    return () => {
      isActive = false;
      abortController.abort();
      clearInterval(pollInterval);
      clearInterval(heartbeatInterval);
      supabase.removeChannel(channel);
    };
  }, [channelId, isDM, queryClient]);
}
