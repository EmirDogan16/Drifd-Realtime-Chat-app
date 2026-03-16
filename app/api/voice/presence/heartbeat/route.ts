import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
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

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    channelId?: string;
    isMuted?: boolean;
    isDeafened?: boolean;
  };
  const channelId = (body.channelId || '').trim();
  const isMuted = typeof body.isMuted === 'boolean' ? body.isMuted : undefined;
  const isDeafened = typeof body.isDeafened === 'boolean' ? body.isDeafened : undefined;

  if (!channelId || !isUuid(channelId)) {
    return NextResponse.json({ error: 'Valid channelId is required' }, { status: 400 });
  }

  const updatePayload: Record<string, string | boolean> = {
    last_seen: new Date().toISOString(),
  };

  if (typeof isDeafened === 'boolean') {
    updatePayload.is_deafened = isDeafened;
    updatePayload.is_muted = Boolean(isMuted) || isDeafened;
  } else if (typeof isMuted === 'boolean') {
    updatePayload.is_muted = isMuted;
  }

  const db = supabase as unknown as {
    from: (table: string) => {
      update: (value: Record<string, string | boolean>) => {
        eq: (column: string, value: string) => {
          eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
        };
      };
    };
  };

  let { error } = await db
    .from('voice_channel_presence')
    .update(updatePayload)
    .eq('profileid', user.id)
    .eq('channelid', channelId);

  // Backward compatibility: DB may not have new columns yet.
  if (error && isMissingVoiceStateColumn(error.message)) {
    const legacyResult = await db
      .from('voice_channel_presence')
      .update({ last_seen: new Date().toISOString() })
      .eq('profileid', user.id)
      .eq('channelid', channelId);

    error = legacyResult.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
