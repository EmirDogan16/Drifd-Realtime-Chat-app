import { NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';
import { createClient } from '@/utils/supabase/server';

type LiveKitUserMetadata = {
  avatarUrl?: string | null;
};

type ProfilePreview = {
  username: string;
  imageurl: string | null;
};

type ChannelPreview = {
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
    const missing = [
      !livekitApiKey ? 'LIVEKIT_API_KEY' : null,
      !livekitApiSecret ? 'LIVEKIT_API_SECRET' : null,
      !livekitUrl ? 'LIVEKIT_URL (or NEXT_PUBLIC_LIVEKIT_URL)' : null,
    ].filter(Boolean);

    return NextResponse.json(
      {
        error: 'LiveKit is not configured.',
        missing,
        hint: 'Set these values in .env.local and restart the server. URL should be a wss:// LiveKit server URL.',
      },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const room = searchParams.get('room');

  if (!room) {
    return NextResponse.json({ error: 'room is required' }, { status: 400 });
  }

  if (!isUuid(room)) {
    return NextResponse.json({ error: 'room must be a valid channel id' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Ensure caller can only join channels they have access to.
  // We lookup channel -> server, then verify membership.
  // Cast to minimal shapes to avoid occasional Supabase type inference issues.
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
    .select('serverid, type')
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

    if (!memberResponse.data) {
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
  });

  // NOTE: In some setups, Supabase type inference can incorrectly resolve this table as `never`.
  // We keep runtime behavior identical, but cast the response to a minimal shape we need.
  const profileResponse = await (supabase as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => Promise<{ data: ProfilePreview | null }>;
        };
      };
    };
  })
    .from('profiles')
    .select('username, imageurl')
    .eq('id', user.id)
    .maybeSingle();

  const profile = profileResponse.data;

  const username =
    profile?.username ||
    (typeof user.user_metadata?.username === 'string' ? (user.user_metadata.username as string) : null) ||
    (user.email ? user.email.split('@')[0] : null) ||
    user.id;

  const avatarUrl =
    profile?.imageurl ||
    (typeof user.user_metadata?.imageUrl === 'string' ? (user.user_metadata.imageUrl as string) : null) ||
    (typeof user.user_metadata?.avatar_url === 'string' ? (user.user_metadata.avatar_url as string) : null) ||
    (typeof user.user_metadata?.picture === 'string' ? (user.user_metadata.picture as string) : null) ||
    null;

  const token = new AccessToken(livekitApiKey, livekitApiSecret, {
    identity: user.id,
    name: username,
    metadata: JSON.stringify({ avatarUrl } satisfies LiveKitUserMetadata),
    ttl: '1h',
  });

  token.addGrant({
    roomJoin: true,
    room,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: true,
  });

  const jwt = await token.toJwt();

  return NextResponse.json({ token: jwt, url: livekitUrl });
}
