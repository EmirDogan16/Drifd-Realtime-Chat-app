import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { messageId, channelId, isDM } = await request.json();

    if (!messageId || !channelId) {
      return NextResponse.json(
        { error: 'Message ID and Channel ID are required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if message belongs to user or if user is admin/moderator
    const tableName = isDM ? 'dm_channel_messages' : 'messages';
    
    // For DMs, only message owner can delete
    if (isDM) {
      const { data: message, error: fetchError } = await supabase
        .from(tableName)
        .select('author_id')
        .eq('id', messageId)
        .single();

      if (fetchError) {
        return NextResponse.json(
          { error: 'Message not found' },
          { status: 404 }
        );
      }

      if (message.author_id !== user.id) {
        return NextResponse.json(
          { error: 'Unauthorized to delete this message' },
          { status: 403 }
        );
      }
    } else {
      // For server channels, check if user is message owner, admin, or moderator
      const { data: message, error: fetchError } = await supabase
        .from(tableName)
        .select('memberid, channelid')
        .eq('id', messageId)
        .single();

      if (fetchError) {
        return NextResponse.json(
          { error: 'Message not found' },
          { status: 404 }
        );
      }

      // Get the sender's member info
      const { data: messageMember } = await supabase
        .from('members')
        .select('profileid')
        .eq('id', message.memberid)
        .single();

      const isOwnMessage = messageMember?.profileid === user.id;

      // If not own message, check for admin/moderator role
      if (!isOwnMessage) {
        // Get the channel's server ID
        const { data: channel } = await supabase
          .from('channels')
          .select('serverid')
          .eq('id', message.channelid)
          .single();

        if (!channel) {
          return NextResponse.json(
            { error: 'Channel not found' },
            { status: 404 }
          );
        }

        // Get current user's member role in this server
        const { data: currentMember } = await supabase
          .from('members')
          .select('role')
          .eq('serverid', channel.serverid)
          .eq('profileid', user.id)
          .single();

        if (!currentMember || (currentMember.role !== 'ADMIN' && currentMember.role !== 'MODERATOR')) {
          return NextResponse.json(
            { error: 'Unauthorized to delete this message' },
            { status: 403 }
          );
        }
      }
    }

    // Update message to mark as deleted and clear file
    const { error: updateError } = await supabase
      .from(tableName)
      .update({ 
        deleted: true,
        content: 'Bu mesaj silindi.',
        fileurl: null,
        poll_data: null
      })
      .eq('id', messageId);

    if (updateError) {
      console.error('Update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to delete message' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting message:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
