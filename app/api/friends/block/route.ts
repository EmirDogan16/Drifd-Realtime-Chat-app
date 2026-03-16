import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { targetProfileId?: string };
    const targetProfileId = (body.targetProfileId || '').trim();

    if (!isUuid(targetProfileId)) {
      return NextResponse.json({ error: 'Invalid target profile id' }, { status: 400 });
    }

    if (targetProfileId === user.id) {
      return NextResponse.json({ error: 'Cannot block yourself' }, { status: 400 });
    }

    const { data: existing } = await (supabase as any)
      .from('friendships')
      .select('id')
      .or(`and(requester_id.eq.${user.id},addressee_id.eq.${targetProfileId}),and(requester_id.eq.${targetProfileId},addressee_id.eq.${user.id})`)
      .maybeSingle();

    if (existing?.id) {
      const { error: updateError } = await (supabase as any)
        .from('friendships')
        .update({
          requester_id: user.id,
          addressee_id: targetProfileId,
          status: 'BLOCKED',
        })
        .eq('id', existing.id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, blocked: true });
    }

    const { error: insertError } = await (supabase as any)
      .from('friendships')
      .insert({
        requester_id: user.id,
        addressee_id: targetProfileId,
        status: 'BLOCKED',
      });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, blocked: true });
  } catch (error) {
    console.error('[FRIENDS_BLOCK]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
