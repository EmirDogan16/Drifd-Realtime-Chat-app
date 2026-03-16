import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

type PendingRow = {
  id: string;
  requester_id: string;
  requester: {
    id: string;
    username: string;
    imageurl: string | null;
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
      requester:profiles!friendships_requester_id_fkey(id, username, imageurl)
    `)
    .eq('addressee_id', user.id)
    .eq('status', 'PENDING')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const pendingRequests = ((data as PendingRow[] | null) ?? []).map((row) => ({
    id: row.id,
    requester_id: row.requester_id,
    requester: {
      id: row.requester?.id || row.requester_id,
      username: row.requester?.username || 'Unknown',
      imageurl: row.requester?.imageurl || null,
    },
  }));

  return NextResponse.json({ pendingRequests });
}
