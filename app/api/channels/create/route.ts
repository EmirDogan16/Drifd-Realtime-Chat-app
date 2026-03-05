import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { serverId, name, type, isPrivate, categoryid } = body;

    if (!serverId || !name || !type) {
      return NextResponse.json(
        { error: 'Server ID, name, and type are required' },
        { status: 400 }
      );
    }

    // Validate channel name
    if (name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Channel name cannot be empty' },
        { status: 400 }
      );
    }

    if (name.length > 100) {
      return NextResponse.json(
        { error: 'Channel name is too long' },
        { status: 400 }
      );
    }

    // Validate channel type
    if (!['TEXT', 'AUDIO', 'VIDEO'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid channel type' },
        { status: 400 }
      );
    }

    // Check if user is a member of the server and has permission to create channels
    const { data: member, error: memberError } = await supabase
      .from('members')
      .select('role')
      .eq('serverid', serverId)
      .eq('profileid', user.id)
      .single();

    if (memberError || !member) {
      return NextResponse.json(
        { error: 'You are not a member of this server' },
        { status: 403 }
      );
    }

    // Only admins, moderators, and owners can create channels
    if (!['ADMIN', 'MODERATOR', 'OWNER'].includes((member as any).role)) {
      return NextResponse.json(
        { error: 'You do not have permission to create channels' },
        { status: 403 }
      );
    }

    // Create the channel
    const channelData: any = {
      serverid: serverId,
      profileid: user.id,
      name: name.trim(),
      type: type,
    };

    // Add categoryid if provided
    if (categoryid) {
      channelData.categoryid = categoryid;
    }

    // Add default quality settings for AUDIO and VIDEO channels
    if (type === 'AUDIO' || type === 'VIDEO') {
      channelData.bitrate = 64; // Default bitrate
      channelData.video_quality = 'auto'; // Default video quality
    }

    const { data: channel, error: channelError } = await supabase
      .from('channels')
      .insert(channelData)
      .select()
      .single();

    if (channelError) {
      console.error('Error creating channel:', channelError);
      return NextResponse.json(
        { error: 'Failed to create channel' },
        { status: 500 }
      );
    }

    // Revalidate the server page to show the new channel immediately
    revalidatePath(`/servers/${serverId}`);

    return NextResponse.json(channel);
  } catch (error) {
    console.error('Error in create channel API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
