import { NextResponse } from 'next/server';
import { RoomServiceClient } from 'livekit-server-sdk';
import { createClient } from '@/utils/supabase/server';

type ChannelPreview = {
  id: string;
  serverid: string;
  type: 'TEXT' | 'AUDIO' | 'VIDEO';
};

type DMChannelPreview = {
  id: string;
  profile_one_id: string;
  profile_two_id: string;
};

type MemberPreview = {
  id: string;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(request: Request) {
  const livekitApiKey = process.env.LIVEKIT_API_KEY;
  const livekitApiSecret = process.env.LIVEKIT_API_SECRET;
  const livekitUrl = process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL;

  if (!livekitApiKey || !livekitApiSecret || !livekitUrl) {
    return NextResponse.json({ error: 'LiveKit is not configured.' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const room = (searchParams.get('room') || '').trim();

  if (!room || !isUuid(room)) {
    return NextResponse.json({ error: 'Valid room id is required.' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const channelResponse = await (supabase as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => Promise<{ data: ChannelPreview | null }>;
        };
      };
    };
  })
    .from('channels')
    .select('id, serverid, type')
    .eq('id', room)
    .maybeSingle();

  const channel = channelResponse.data;

  if (channel) {
    if (channel.type !== 'AUDIO' && channel.type !== 'VIDEO') {
      return NextResponse.json({ error: 'LiveKit is only enabled for audio/video channels' }, { status: 400 });
    }

    const memberResponse = await (supabase as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (column: string, value: string) => {
            eq: (column: string, value: string) => {
              maybeSingle: () => Promise<{ data: MemberPreview | null }>;
            };
          };
        };
      };
    })
      .from('members')
      .select('id')
      .eq('serverid', channel.serverid)
      .eq('profileid', user.id)
      .maybeSingle();

    const membership = memberResponse.data;

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  } else {
    const dmResponse = await (supabase as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (column: string, value: string) => {
            maybeSingle: () => Promise<{ data: DMChannelPreview | null }>;
          };
        };
      };
    })
      .from('dm_channels')
      .select('id, profile_one_id, profile_two_id')
      .eq('id', room)
      .maybeSingle();

    const dmChannel = dmResponse.data;

    if (!dmChannel || (dmChannel.profile_one_id !== user.id && dmChannel.profile_two_id !== user.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const roomService = new RoomServiceClient(livekitUrl, livekitApiKey, livekitApiSecret);

  try {
    const participants = await roomService.listParticipants(room);
    const participantCount = Array.isArray(participants) ? participants.length : 0;
    const othersCount = Array.isArray(participants)
      ? participants.filter((participant) => participant.identity !== user.id).length
      : 0;

    return NextResponse.json({ ok: true, participantCount, othersCount });
  } catch {
    // Room may not exist yet or may already be gone. Treat as empty.
    return NextResponse.json({ ok: true, participantCount: 0, othersCount: 0 });
  }
}
