import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { friendshipId } = await req.json();

    if (!friendshipId) {
      return new NextResponse('Friendship ID required', { status: 400 });
    }

    // Verify this user is the addressee
    const { data: friendship, error: fetchError } = await supabase
      .from('friendships')
      .select('*')
      .eq('id', friendshipId)
      .eq('addressee_id', user.id)
      .eq('status', 'PENDING')
      .single();

    if (fetchError || !friendship) {
      return new NextResponse('Friend request not found', { status: 404 });
    }

    // Update to accepted
    const { error: updateError } = await supabase
      .from('friendships')
      .update({ status: 'ACCEPTED' } as never)
      .eq('id', friendshipId);

    if (updateError) {
      console.error('Error accepting friendship:', updateError);
      return new NextResponse('Internal error', { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[FRIENDS_ACCEPT]', error);
    return new NextResponse('Internal error', { status: 500 });
  }
}
