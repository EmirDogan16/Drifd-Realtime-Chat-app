import { NextResponse } from 'next/server';
import { RoomServiceClient } from 'livekit-server-sdk';
import { createAdminClient, createClient } from '@/utils/supabase/server';

type ModerationAction = 'server_mute' | 'server_deafen' | 'disconnect';

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    channelId?: string;
    targetProfileId?: string;
    action?: ModerationAction;
    enabled?: boolean;
  };

  const channelId = (body.channelId || '').trim();
  const targetProfileId = (body.targetProfileId || '').trim();
  const action = body.action;
  const enabled = body.enabled !== false;

  if (!isUuid(channelId) || !isUuid(targetProfileId) || !action) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  if (!['server_mute', 'server_deafen', 'disconnect'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const { data: channel } = await (supabase as any)
    .from('channels')
    .select('id, serverid, type')
    .eq('id', channelId)
    .maybeSingle();

  if (!channel || !['AUDIO', 'VIDEO'].includes(channel.type)) {
    return NextResponse.json({ error: 'Voice channel not found' }, { status: 404 });
  }

  const { data: actorMember } = await (supabase as any)
    .from('members')
    .select('role')
    .eq('serverid', channel.serverid)
    .eq('profileid', user.id)
    .maybeSingle();

  if (!actorMember || !['ADMIN', 'MODERATOR'].includes(actorMember.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const livekitApiKey = process.env.LIVEKIT_API_KEY;
  const livekitApiSecret = process.env.LIVEKIT_API_SECRET;
  const livekitUrl = process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL;

  if (!livekitApiKey || !livekitApiSecret || !livekitUrl) {
    return NextResponse.json({ error: 'LiveKit is not configured' }, { status: 500 });
  }

  const roomService = new RoomServiceClient(livekitUrl, livekitApiKey, livekitApiSecret);

  try {
    const participants = await roomService.listParticipants(channelId);
    const participant = participants.find((p) => p.identity === targetProfileId);

    if (!participant) {
      return NextResponse.json({ error: 'Target participant is not in this call' }, { status: 404 });
    }

    if (action === 'disconnect') {
      await roomService.removeParticipant(channelId, targetProfileId);

      const admin = createAdminClient() as any;
      await admin
        .from('voice_channel_presence')
        .delete()
        .eq('serverid', channel.serverid)
        .eq('channelid', channelId)
        .eq('profileid', targetProfileId);

      return NextResponse.json({ ok: true, action, enabled: true });
    }

    if (action === 'server_mute') {
      for (const track of participant.tracks ?? []) {
        if (track?.sid) {
          await roomService.mutePublishedTrack(channelId, targetProfileId, track.sid, enabled);
        }
      }

      return NextResponse.json({ ok: true, action, enabled });
    }

    if (action === 'server_deafen') {
      await roomService.updateParticipant(channelId, targetProfileId, {
        permission: {
          canSubscribe: !enabled,
        },
      });

      return NextResponse.json({ ok: true, action, enabled });
    }

    return NextResponse.json({ error: 'Unhandled action' }, { status: 400 });
  } catch (error) {
    console.error('[VOICE_MODERATION]', error);
    return NextResponse.json({ error: 'Moderation failed' }, { status: 500 });
  }
}
