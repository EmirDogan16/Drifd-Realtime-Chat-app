'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { createClient } from '@/utils/supabase/client';
import type { Database } from '@/types/supabase';

type MessageRow = Database['public']['Tables']['messages']['Row'];
type DMMessageRow = Database['public']['Tables']['dm_channel_messages']['Row'];

const PAGE_SIZE = 10;

interface UseChatQueryOptions {
  channelId: string;
  isDM?: boolean;
}

export function useChatQuery({ channelId, isDM = false }: UseChatQueryOptions) {
  return useInfiniteQuery<(MessageRow | DMMessageRow)[]>({
    queryKey: ['chat', channelId, isDM ? 'dm' : 'channel'],
    queryFn: async ({ pageParam = 0 }) => {
      if (channelId.startsWith('demo-')) {
        return [
          {
            id: 'demo-msg-1',
            channelid: channelId,
            memberid: 'm2',
            content: 'Welcome to Drifd!',
            fileurl: null,
            deleted: false,
            created_at: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
            updated_at: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
          },
          {
            id: 'demo-msg-2',
            channelid: channelId,
            memberid: 'm3',
            content: 'This UI looks clean.',
            fileurl: null,
            deleted: false,
            created_at: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
            updated_at: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
          },
        ];
      }

      const offset = pageParam as number;
      const supabase = createClient();

      if (isDM) {
        // Query DM messages
        const { data, error } = await supabase
          .from('dm_channel_messages')
          .select('id, content, fileurl, author_id, dm_channel_id, deleted, created_at, updated_at')
          .eq('dm_channel_id', channelId)
          .order('created_at', { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);

        if (error) {
          throw new Error(error.message);
        }

        return (data ?? []).reverse();
      } else {
        // Query regular channel messages
        const { data, error } = await supabase
          .from('messages')
          .select('id, content, fileurl, poll_data, memberid, channelid, deleted, created_at, updated_at')
          .eq('channelid', channelId)
          .order('created_at', { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);

        if (error) {
          throw new Error(error.message);
        }

        return (data ?? []).reverse();
      }
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return allPages.length * PAGE_SIZE;
    },
  });
}
