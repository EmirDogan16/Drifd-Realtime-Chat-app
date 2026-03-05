import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check if user is authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { serverId } = await request.json();

    if (!serverId) {
      return NextResponse.json(
        { error: 'Server ID is required' },
        { status: 400 }
      );
    }

    // Check if user is the server owner (owners cannot leave, they must delete)
    const { data: server, error: serverError } = await supabase
      .from('servers')
      .select('profileid, name')
      .eq('id', serverId)
      .single();

    if (serverError || !server) {
      return NextResponse.json(
        { error: 'Server not found' },
        { status: 404 }
      );
    }

    if ((server as { profileid: string; name: string }).profileid === user.id) {
      return NextResponse.json(
        { error: 'Server owners cannot leave. Delete the server instead.' },
        { status: 403 }
      );
    }

    // Find and delete the member record
    const { error: deleteError } = await supabase
      .from('members')
      .delete()
      .eq('serverid', serverId)
      .eq('profileid', user.id);

    if (deleteError) {
      console.error('[Leave Server] Error:', deleteError);
      return NextResponse.json(
        { error: 'Failed to leave server' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Left server successfully'
    });

  } catch (error) {
    console.error('[Leave Server] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
