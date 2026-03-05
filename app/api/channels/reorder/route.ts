import { createAdminClient, createClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function PATCH(req: NextRequest) {
  try {
    const { channelId, newPosition, serverId, channelType, categoryId } = await req.json();

    console.log('[Reorder API] ===== REQUEST START =====');
    console.log('[Reorder API] Request:', { channelId, newPosition, serverId, channelType, categoryId });

    if (!channelId || newPosition === undefined || !serverId || !channelType) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Authentication check
    const userSupabase = await createClient();
    const { data: { user }, error: authError } = await userSupabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Authorization check - verify user is ADMIN, MODERATOR, or OWNER in this server
    const { data: member, error: memberError } = await userSupabase
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

    if (!['ADMIN', 'MODERATOR', 'OWNER'].includes((member as any).role)) {
      return NextResponse.json(
        { error: 'You do not have permission to reorder channels' },
        { status: 403 }
      );
    }

    const supabase = await createAdminClient();

    // Get all channels of the same type in this server (and category if specified), ordered by position
    // Special case: 'VOICE' means both AUDIO and VIDEO channels
    let query = supabase
      .from('channels')
      .select('id, name, position, type, categoryid')
      .eq('serverid', serverId)
      .order('position', { ascending: true });

    // Filter by category if provided
    // Special handling: 'category-text' and 'category-audio' are default categories with null categoryid
    if (categoryId && categoryId !== 'category-text' && categoryId !== 'category-audio') {
      console.log('[Reorder API] Filtering by custom categoryId:', categoryId);
      query = query.eq('categoryid', categoryId);
    } else {
      // If no categoryId or default category, filter for null categoryid (default categories)
      console.log('[Reorder API] Filtering by null categoryid (default category)');
      query = query.is('categoryid', null);
    }

    if (channelType === 'VOICE') {
      // Include both AUDIO and VIDEO channels
      console.log('[Reorder API] Including AUDIO and VIDEO channels');
      query = query.in('type', ['AUDIO', 'VIDEO']);
    } else {
      // Single type (TEXT)
      console.log('[Reorder API] Filtering for TEXT channels');
      query = query.eq('type', channelType);
    }

    const { data: channels, error: fetchError } = await query;

    console.log('[Reorder API] Fetched channels count:', channels?.length);
    console.log('[Reorder API] Fetched channels:', channels?.map(c => ({ 
      id: c.id, 
      name: (c as any).name,
      position: c.position, 
      type: c.type,
      categoryid: (c as any).categoryid 
    })));
    console.log('[Reorder API] Fetch error:', fetchError);

    type ChannelPos = { id: string; position: number; type?: string };

    if (fetchError || !channels) {
      console.error('Error fetching channels:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch channels', details: fetchError?.message },
        { status: 500 }
      );
    }

    const typedChannels = channels as ChannelPos[];

    // Find the channel being moved using array index (not position field)
    const oldIndex = typedChannels.findIndex((c) => c.id === channelId);
    console.log('[Reorder API] Channel oldIndex:', oldIndex, 'newPosition:', newPosition);
    
    if (oldIndex === -1) {
      console.log('[Reorder API] ERROR: Channel not found in fetched channels');
      return NextResponse.json(
        { error: 'Channel not found' },
        { status: 404 }
      );
    }

    // If position hasn't changed, no need to update
    if (oldIndex === newPosition) {
      console.log('[Reorder API] Position unchanged, skipping update');
      return NextResponse.json({ success: true });
    }

    // Reorder channels in-memory using array manipulation
    const reorderedChannels = [...typedChannels];
    const [movedChannel] = reorderedChannels.splice(oldIndex, 1);
    reorderedChannels.splice(newPosition, 0, movedChannel);

    console.log('[Reorder API] After reorder:', reorderedChannels.map((c, i) => ({ 
      index: i,
      id: c.id, 
      name: (c as any).name,
      oldPosition: c.position,
      newPosition: i 
    })));

    // Update ALL channels in this category with their new positions (0-indexed within category)
    // This ensures positions are always normalized (0, 1, 2...) within each category
    const updates: Array<{ id: string; position: number }> = [];
    reorderedChannels.forEach((channel, index) => {
      // Update if the position changed from database value OR needs normalization
      if (channel.position !== index) {
        updates.push({ id: channel.id, position: index });
      }
    });

    console.log('[Reorder API] Updates to apply:', updates.map(u => ({
      id: u.id,
      name: (typedChannels.find(c => c.id === u.id) as any)?.name,
      newPosition: u.position
    })));

    // Apply all updates
    for (const update of updates) {
      console.log('[Reorder API] Updating channel:', update.id, 'to position:', update.position);
      const { error: updateError } = await supabase
        .from('channels')
        .update({ position: update.position } as any)
        .eq('id', update.id);

      if (updateError) {
        console.error('[Reorder API] Error updating channel position:', updateError);
        return NextResponse.json(
          { error: 'Failed to update channel positions' },
          { status: 500 }
        );
      }
    }

    console.log('[Reorder API] ===== SUCCESS =====');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in channel reorder API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
