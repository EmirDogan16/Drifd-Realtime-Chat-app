import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

const MESSAGES_BATCH = 50;

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get('cursor');
    const dmChannelId = searchParams.get('dmChannelId');

    if (!dmChannelId) {
      return new NextResponse('DM Channel ID missing', { status: 400 });
    }

    // Verify user is participant in this DM channel
    const { data: dmChannel, error: channelError } = await supabase
      .from('dm_channels')
      .select('id, profile_one_id, profile_two_id')
      .eq('id', dmChannelId)
      .single();

    if (channelError || !dmChannel) {
      return new NextResponse('DM channel not found', { status: 404 });
    }

    const channel = dmChannel as any;

    if (channel.profile_one_id !== user.id && channel.profile_two_id !== user.id) {
      return new NextResponse('Unauthorized', { status: 403 });
    }

    let query = supabase
      .from('dm_channel_messages')
      .select(`
        id,
        content,
        fileurl,
        deleted,
        created_at,
        updated_at,
        author:profiles!dm_channel_messages_author_id_fkey(
          id,
          username,
          imageurl
        )
      `)
      .eq('dm_channel_id', dmChannelId)
      .order('created_at', { ascending: false })
      .limit(MESSAGES_BATCH);

    if (cursor) {
      query = query.lt('created_at', cursor);
    }

    const { data: messages, error: messagesError } = await query;

    if (messagesError) {
      console.error('Error fetching messages:', messagesError);
      return new NextResponse('Internal error', { status: 500 });
    }

    const msgs = messages as any[];

    let nextCursor = null;
    if (msgs && msgs.length === MESSAGES_BATCH) {
      nextCursor = msgs[msgs.length - 1].created_at;
    }

    return NextResponse.json({
      items: msgs || [],
      nextCursor
    });
  } catch (error) {
    console.error('[DM_MESSAGES_GET]', error);
    return new NextResponse('Internal error', { status: 500 });
  }
}
