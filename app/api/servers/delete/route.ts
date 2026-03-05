import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function DELETE(request: NextRequest) {
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

    // Check if user is the server owner
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

    if ((server as { profileid: string; name: string }).profileid !== user.id) {
      return NextResponse.json(
        { error: 'Only the server owner can delete this server' },
        { status: 403 }
      );
    }

    // Delete the server (CASCADE will handle members, channels, messages)
    const { error: deleteError } = await supabase
      .from('servers')
      .delete()
      .eq('id', serverId);

    if (deleteError) {
      console.error('[Delete Server] Error:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete server' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Server deleted successfully'
    });

  } catch (error) {
    console.error('[Delete Server] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
