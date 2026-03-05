import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ serverId: string; userId: string }> }
) {
  try {
    const supabase = await createClient();
    const { serverId, userId } = await params;

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin/moderator or server owner
    const { data: member } = await supabase
      .from('members')
      .select('role')
      .eq('serverid', serverId)
      .eq('profileid', user.id)
      .maybeSingle();

    const { data: server } = await supabase
      .from('servers')
      .select('profileid')
      .eq('id', serverId)
      .maybeSingle();

    const isOwner = server?.profileid === user.id;
    const isAdmin = member?.role === 'ADMIN' || member?.role === 'MODERATOR';

    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Remove ban
    const { error: deleteError } = await supabase
      .from('banned_users')
      .delete()
      .eq('serverid', serverId)
      .eq('profileid', userId);

    if (deleteError) {
      console.error('[DELETE Ban] Error:', deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE Ban] Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
