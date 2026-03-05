import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  try {
    const supabase = await createClient();
    const { serverId } = await params;
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

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

    const isOwner = (server as any)?.profileid === user.id;
    const isAdmin = (member as any)?.role === 'ADMIN' || (member as any)?.role === 'MODERATOR';

    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check if user is already banned
    const { data: existingBan } = await supabase
      .from('banned_users')
      .select('id')
      .eq('serverid', serverId)
      .eq('profileid', userId)
      .maybeSingle();

    if (existingBan) {
      return NextResponse.json({ error: 'User already banned' }, { status: 400 });
    }

    // Insert ban record
    const { error: banError } = await supabase
      .from('banned_users')
      .insert({
        serverid: serverId,
        profileid: userId,
        banned_by: user.id,
      } as any);

    if (banError) {
      console.error('[POST Ban] Error:', banError);
      return NextResponse.json({ error: banError.message }, { status: 500 });
    }

    // Remove user from server members
    const { error: removeMemberError } = await supabase
      .from('members')
      .delete()
      .eq('serverid', serverId)
      .eq('profileid', userId);

    if (removeMemberError) {
      console.error('[POST Ban] Remove member error:', removeMemberError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[POST Ban] Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  try {
    const supabase = await createClient();
    const { serverId } = await params;

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

    const isOwner = (server as any)?.profileid === user.id;
    const isAdmin = (member as any)?.role === 'ADMIN' || (member as any)?.role === 'MODERATOR';

    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get banned users with profile info
    const { data: bannedData, error } = await supabase
      .from('banned_users')
      .select(`
        profileid,
        created_at,
        banned_by,
        reason,
        profiles:profileid (
          id,
          username,
          imageurl
        )
      `)
      .eq('serverid', serverId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[GET Bans] Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Transform data to match expected format
    const bans = (bannedData || []).map((ban: any) => ({
      id: ban.profiles?.id || ban.profileid,
      username: ban.profiles?.username || 'Unknown',
      displayname: ban.profiles?.username || 'Unknown',
      avatarurl: ban.profiles?.imageurl || null,
      banned_at: ban.created_at,
      banned_by: ban.banned_by,
      reason: ban.reason,
    }));

    return NextResponse.json({ bans });
  } catch (error) {
    console.error('[GET Bans] Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
