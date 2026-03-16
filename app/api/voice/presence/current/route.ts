import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

type ChannelLookup = {
  id: string;
  serverid: string;
};

type PresenceLookup = {
  serverid: string;
  channelid: string;
  last_seen?: string;
};

type CurrentChannelLookup = {
  id: string;
  name: string;
};

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const channelId = (searchParams.get('channelId') || '').trim();
  let presence: PresenceLookup | null = null;
  let scopedServerId: string | null = null;

  if (channelId) {
    if (!isUuid(channelId)) {
      return NextResponse.json({ error: 'Valid channelId is required' }, { status: 400 });
    }

    const channelResponse = await (supabase as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (column: string, value: string) => {
            maybeSingle: () => Promise<{ data: ChannelLookup | null }>;
          };
        };
      };
    })
      .from('channels')
      .select('id, serverid')
      .eq('id', channelId)
      .maybeSingle();

    const channel = channelResponse.data;
    if (!channel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    scopedServerId = channel.serverid;

    const presenceResponse = await (supabase as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (column: string, value: string) => {
            eq: (column: string, value: string) => {
              maybeSingle: () => Promise<{ data: PresenceLookup | null }>;
            };
          };
        };
      };
    })
      .from('voice_channel_presence')
      .select('serverid, channelid, last_seen')
      .eq('serverid', scopedServerId)
      .eq('profileid', user.id)
      .maybeSingle();

    presence = presenceResponse.data;
  } else {
    const activeSince = new Date(Date.now() - 120000).toISOString();
    const presenceResponse = await (supabase as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (column: string, value: string) => {
            gte: (column: string, value: string) => {
              order: (column: string, options: { ascending: boolean }) => {
                limit: (n: number) => {
                  maybeSingle: () => Promise<{ data: PresenceLookup | null }>;
                };
              };
            };
          };
        };
      };
    })
      .from('voice_channel_presence')
      .select('serverid, channelid, last_seen')
      .eq('profileid', user.id)
      .gte('last_seen', activeSince)
      .order('last_seen', { ascending: false })
      .limit(1)
      .maybeSingle();

    presence = presenceResponse.data;
    scopedServerId = presence?.serverid ?? null;
  }

  let currentChannelName: string | null = null;
  if (presence?.channelid) {
    const currentChannelResponse = await (supabase as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (column: string, value: string) => {
            maybeSingle: () => Promise<{ data: CurrentChannelLookup | null }>;
          };
        };
      };
    })
      .from('channels')
      .select('id, name')
      .eq('id', presence.channelid)
      .maybeSingle();

    currentChannelName = currentChannelResponse.data?.name ?? null;
  }

  return NextResponse.json({
    ok: true,
    serverId: scopedServerId,
    currentChannelId: presence?.channelid ?? null,
    currentChannelName,
  });
}
