import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

type FriendshipRow = {
  id: string;
  requester_id: string;
  addressee_id: string;
  requester: {
    id: string;
    username: string;
    imageurl: string | null;
    status?: 'online' | 'idle' | 'dnd' | 'invisible' | null;
    last_seen?: string | null;
  } | null;
  addressee: {
    id: string;
    username: string;
    imageurl: string | null;
    status?: 'online' | 'idle' | 'dnd' | 'invisible' | null;
    last_seen?: string | null;
  } | null;
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await (supabase as any)
    .from('friendships')
    .select(`
      id,
      requester_id,
      addressee_id,
      requester:profiles!friendships_requester_id_fkey(id, username, imageurl, status, last_seen),
      addressee:profiles!friendships_addressee_id_fkey(id, username, imageurl, status, last_seen)
    `)
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
    .eq('status', 'ACCEPTED')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const friends = ((data as FriendshipRow[] | null) ?? []).map((friendship) => {
    const friend = friendship.requester_id === user.id ? friendship.addressee : friendship.requester;

    return {
      friendshipId: friendship.id,
      friendId: friend?.id || (friendship.requester_id === user.id ? friendship.addressee_id : friendship.requester_id),
      friend: {
        id: friend?.id || (friendship.requester_id === user.id ? friendship.addressee_id : friendship.requester_id),
        username: friend?.username || 'Unknown',
        imageurl: friend?.imageurl || null,
        status: friend?.status === 'invisible' ? 'offline' : (friend?.status || 'offline'),
        last_seen: friend?.last_seen || null,
      },
    };
  });

  return NextResponse.json({ friends });
}
