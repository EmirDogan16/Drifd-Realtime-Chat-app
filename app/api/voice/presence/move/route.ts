import { NextResponse } from 'next/server';
import { RoomServiceClient } from 'livekit-server-sdk';
import { createAdminClient, createClient } from '@/utils/supabase/server';

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
    serverId?: string;
    targetChannelId?: string;
    targetProfileId?: string;
  };

  const serverId = (body.serverId || '').trim();
  const targetChannelId = (body.targetChannelId || '').trim();
  const targetProfileId = (body.targetProfileId || '').trim();

  if (!isUuid(serverId) || !isUuid(targetChannelId) || !isUuid(targetProfileId)) {
    return NextResponse.json({ error: 'Invalid ids' }, { status: 400 });
  }

  const isSelfMove = targetProfileId === user.id;

  // Permission check: self-move is allowed for all server members, moving others requires ADMIN/MODERATOR.
  if (!isSelfMove) {
    const { data: actorMember } = await (supabase as any)
      .from('members')
      .select('role')
      .eq('serverid', serverId)
      .eq('profileid', user.id)
      .maybeSingle();

    if (!actorMember || !['ADMIN', 'MODERATOR'].includes(actorMember.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  } else {
    const { data: selfMember } = await (supabase as any)
      .from('members')
      .select('id')
      .eq('serverid', serverId)
      .eq('profileid', user.id)
      .maybeSingle();

    if (!selfMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const { data: targetChannel } = await (supabase as any)
    .from('channels')
    .select('id, serverid, type')
    .eq('id', targetChannelId)
    .eq('serverid', serverId)
    .maybeSingle();

  if (!targetChannel || !['AUDIO', 'VIDEO'].includes(targetChannel.type)) {
    return NextResponse.json({ error: 'Target voice channel not found' }, { status: 404 });
  }

  const admin = createAdminClient() as any;
  const now = new Date().toISOString();

  const { data: existingPresence } = await admin
    .from('voice_channel_presence')
    .select('profileid, channelid')
    .eq('serverid', serverId)
    .eq('profileid', targetProfileId)
    .maybeSingle();

  if (!existingPresence) {
    return NextResponse.json({ error: 'User is not in any voice channel' }, { status: 404 });
  }

  const { error: updateError } = await admin
    .from('voice_channel_presence')
    .update({
      channelid: targetChannelId,
      joined_at: now,
      last_seen: now,
    })
    .eq('serverid', serverId)
    .eq('profileid', targetProfileId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Disconnect moved participant from their old LiveKit room so client can immediately rebind to target channel.
  const previousChannelId = (existingPresence as { channelid?: string } | null)?.channelid;
  if (previousChannelId && previousChannelId !== targetChannelId) {
    const livekitApiKey = process.env.LIVEKIT_API_KEY;
    const livekitApiSecret = process.env.LIVEKIT_API_SECRET;
    const livekitUrl = process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL;

    if (livekitApiKey && livekitApiSecret && livekitUrl) {
      try {
        const roomService = new RoomServiceClient(livekitUrl, livekitApiKey, livekitApiSecret);
        await roomService.removeParticipant(previousChannelId, targetProfileId);
      } catch {
        // best-effort only
      }
    }
  }

  return NextResponse.json({ ok: true });
}
