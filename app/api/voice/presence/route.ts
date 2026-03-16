import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

type ChannelLookup = {
  id: string;
  serverid: string;
  type: 'TEXT' | 'AUDIO' | 'VIDEO';
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function getAuthedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function isMissingVoiceStateColumn(message: string | undefined) {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes('is_muted')
    || lower.includes('is_deafened')
    || lower.includes('column')
  );
}

export async function POST(request: Request) {
  const { supabase, user } = await getAuthedUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    channelId?: string;
    isMuted?: boolean;
    isDeafened?: boolean;
  };
  const channelId = (body.channelId || '').trim();
  const isMuted = Boolean(body.isMuted);
  const isDeafened = Boolean(body.isDeafened);

  if (!channelId || !isUuid(channelId)) {
    return NextResponse.json({ error: 'Valid channelId is required' }, { status: 400 });
  }

  const channelResp = await (supabase as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => Promise<{ data: ChannelLookup | null }>;
        };
      };
    };
  })
    .from('channels')
    .select('id, serverid, type')
    .eq('id', channelId)
    .maybeSingle();

  const channel = channelResp.data;
  if (!channel || (channel.type !== 'AUDIO' && channel.type !== 'VIDEO')) {
    return NextResponse.json({ error: 'Voice channel not found' }, { status: 404 });
  }

  const payload = {
    serverid: channel.serverid,
    channelid: channel.id,
    profileid: user.id,
    is_muted: isMuted || isDeafened,
    is_deafened: isDeafened,
    joined_at: new Date().toISOString(),
    last_seen: new Date().toISOString(),
  };

  const db = supabase as unknown as {
    from: (table: string) => {
      upsert: (value: Record<string, unknown>, options: { onConflict: string }) => Promise<{ error: { message: string } | null }>;
    };
  };

  let { error } = await db
    .from('voice_channel_presence')
    .upsert(payload, { onConflict: 'serverid,profileid' });

  // Backward compatibility: DB may not have new columns yet.
  if (error && isMissingVoiceStateColumn(error.message)) {
    const legacyPayload = {
      serverid: channel.serverid,
      channelid: channel.id,
      profileid: user.id,
      joined_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
    };

    const legacyResult = await db
      .from('voice_channel_presence')
      .upsert(legacyPayload, { onConflict: 'serverid,profileid' });

    error = legacyResult.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const { supabase, user } = await getAuthedUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { channelId?: string };
  const channelId = (body.channelId || '').trim();

  const db = supabase as unknown as {
    from: (table: string) => {
      delete: () => {
        eq: (column: string, value: string) => {
          eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
        };
      };
    };
  };

  let result: { error: { message: string } | null };
  if (channelId && isUuid(channelId)) {
    result = await db
      .from('voice_channel_presence')
      .delete()
      .eq('profileid', user.id)
      .eq('channelid', channelId);
  } else {
    // Fallback: remove any stale presence rows for this user.
    result = await (supabase as unknown as {
      from: (table: string) => {
        delete: () => {
          eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
        };
      };
    })
      .from('voice_channel_presence')
      .delete()
      .eq('profileid', user.id);
  }

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
