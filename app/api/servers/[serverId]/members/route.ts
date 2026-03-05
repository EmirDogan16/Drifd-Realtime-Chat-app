import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  try {
    const supabase = await createClient();
    const { serverId } = await params;
    const { searchParams } = new URL(request.url);
    const searchQuery = searchParams.get('search') || '';

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is a member of the server
    const { data: membership } = await supabase
      .from('members')
      .select('id')
      .eq('serverid', serverId)
      .eq('profileid', user.id)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    // Get all members with their profiles
    let query = supabase
      .from('members')
      .select(`
        profileid,
        profiles:profileid (
          id,
          username,
          imageurl
        )
      `)
      .eq('serverid', serverId);

    const { data: membersData, error } = await query;

    if (error) {
      console.error('[GET Members] Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Transform and filter by search query
    let members = (membersData || [])
      .filter((m: any) => m.profiles)
      .map((m: any) => ({
        id: m.profiles.id,
        username: m.profiles.username,
        imageurl: m.profiles.imageurl,
      }));

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      members = members.filter((m: any) => 
        m.username.toLowerCase().includes(query) ||
        m.id.toLowerCase().includes(query)
      );
    }

    return NextResponse.json({ members });
  } catch (error) {
    console.error('[GET Members] Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
