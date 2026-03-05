import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { username } = await req.json();

    if (!username) {
      return new NextResponse('Username required', { status: 400 });
    }

    // Find user by username
    const { data: targetUser, error: userError } = await supabase
      .from('profiles')
      .select('id, username')
      .eq('username', username)
      .single();

    if (userError || !targetUser) {
      return new NextResponse('User not found', { status: 404 });
    }

    const target = targetUser as any;

    if (target.id === user.id) {
      return new NextResponse('Cannot add yourself', { status: 400 });
    }

    // Check if friendship already exists
    const { data: existing } = await supabase
      .from('friendships')
      .select('id, status')
      .or(`and(requester_id.eq.${user.id},addressee_id.eq.${target.id}),and(requester_id.eq.${target.id},addressee_id.eq.${user.id})`)
      .maybeSingle();

    const existingFriendship = existing as any;

    if (existingFriendship) {
      if (existingFriendship.status === 'ACCEPTED') {
        return new NextResponse('Already friends', { status: 400 });
      }
      if (existingFriendship.status === 'PENDING') {
        return new NextResponse('Friend request already sent', { status: 400 });
      }
      if (existingFriendship.status === 'BLOCKED') {
        return new NextResponse('Cannot send friend request', { status: 400 });
      }
    }

    // Create friend request
    const { data: friendship, error: createError } = await supabase
      .from('friendships')
      .insert({
        requester_id: user.id,
        addressee_id: target.id,
        status: 'PENDING'
      } as any)
      .select()
      .single();

    if (createError) {
      console.error('Error creating friendship:', createError);
      return new NextResponse('Internal error', { status: 500 });
    }

    return NextResponse.json(friendship);
  } catch (error) {
    console.error('[FRIENDS_ADD]', error);
    return new NextResponse('Internal error', { status: 500 });
  }
}
