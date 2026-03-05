import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/utils/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const inviteCode = searchParams.get('inviteCode');

    if (!inviteCode) {
      return NextResponse.json(
        { error: 'Invite code is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Find server by invite code (public access thanks to our new policy)
    const { data: server, error: serverError } = await supabase
      .from('servers')
      .select('id, name')
      .eq('invitecode', inviteCode)
      .single();

    if (serverError || !server) {
      return NextResponse.json(
        { error: 'Invalid invite code' },
        { status: 404 }
      );
    }

    // Get member count - use service role to bypass RLS
    const adminClient = createAdminClient();
    const { count: memberCount, error: countError } = await adminClient
      .from('members')
      .select('*', { count: 'exact', head: true })
      .eq('serverid', (server as any).id);

    if (countError) {
      console.error('Error counting members:', countError);
      // Return 1+ as fallback (at least owner exists)
      return NextResponse.json({ memberCount: 1 });
    }

    return NextResponse.json({ memberCount: memberCount || 1 });
  } catch (error) {
    console.error('Error in member count API:', error);
    return NextResponse.json(
      { memberCount: 1 }, // Fallback
      { status: 200 }
    );
  }
}
