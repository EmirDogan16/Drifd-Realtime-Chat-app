import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/utils/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const adminClient = createAdminClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Ensure profile exists
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile) {
      // Create profile if it doesn't exist using admin client
      const { error: createProfileError } = await adminClient
        .from('profiles')
        .insert({
          id: user.id,
          name: user.email?.split('@')[0] || 'User',
          email: user.email,
        } as any);

      if (createProfileError) {
        console.error('Error creating profile:', createProfileError);
        return NextResponse.json(
          { error: 'Failed to create profile' },
          { status: 500 }
        );
      }
    }

    const body = await request.json();
    const { inviteCode } = body;

    if (!inviteCode) {
      return NextResponse.json(
        { error: 'Invite code is required' },
        { status: 400 }
      );
    }

    // Find server by invite code
    const { data: server, error: serverError } = await supabase
      .from('servers')
      .select('id')
      .eq('invitecode', inviteCode)
      .single();

    if (serverError || !server) {
      return NextResponse.json(
        { error: 'Invalid invite code' },
        { status: 404 }
      );
    }

    // Check if user is already a member
    const { data: existingMember } = await adminClient
      .from('members')
      .select('id')
      .eq('serverid', (server as any).id)
      .eq('profileid', user.id)
      .maybeSingle();

    if (existingMember) {
      return NextResponse.json(
        { error: 'Already a member of this server' },
        { status: 400 }
      );
    }

    // Check if user is banned from this server
    const { data: bannedUser } = await adminClient
      .from('banned_users')
      .select('id')
      .eq('serverid', (server as any).id)
      .eq('profileid', user.id)
      .maybeSingle();

    if (bannedUser) {
      return NextResponse.json(
        { error: 'You are banned from this server' },
        { status: 403 }
      );
    }

    // Add user as a member with GUEST role using admin client to bypass RLS
    const { data: member, error: memberError } = await adminClient
      .from('members')
      .insert({
        serverid: (server as any).id,
        profileid: user.id,
        role: 'GUEST',
      } as any)
      .select()
      .single();

    if (memberError) {
      console.error('Error adding member:', memberError);
      console.error('Member data attempt:', { serverid: (server as any).id, profileid: user.id, role: 'GUEST' });
      return NextResponse.json(
        { error: `Failed to join server: ${memberError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, serverId: (server as any).id });
  } catch (error) {
    console.error('Error in join server API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
