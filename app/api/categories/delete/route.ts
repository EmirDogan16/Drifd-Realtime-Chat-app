import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

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
    const { serverId, categoryId } = body;

    if (!serverId || !categoryId) {
      return NextResponse.json(
        { error: 'Server ID and category ID are required' },
        { status: 400 }
      );
    }

    // Check if user is a member of the server
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

    // Check if user is owner or admin
    const { data: server, error: serverError } = await supabase
      .from('servers')
      .select('profileid, category_order, category_names')
      .eq('id', serverId)
      .single();

    if (serverError || !server) {
      return NextResponse.json(
        { error: 'Server not found' },
        { status: 404 }
      );
    }

    const isOwner = (server as { profileid: string }).profileid === user.id;
    const isAdmin = (member as { role: string }).role === 'ADMIN' || (member as { role: string }).role === 'MODERATOR';

    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { error: 'Only admins and server owners can delete categories' },
        { status: 403 }
      );
    }

    // Remove category from order
    const currentOrder = (server as { category_order?: string[] }).category_order || [];
    const newOrder = currentOrder.filter(id => id !== categoryId);

    // Remove category from names
    const categoryNames = (server as { category_names?: Record<string, string> }).category_names || {};
    delete categoryNames[categoryId];

    // Update server
    const { error: updateError } = await supabase
      .from('servers')
      .update({ 
        category_order: newOrder,
        category_names: categoryNames
      } as any)
      .eq('id', serverId);

    if (updateError) {
      console.error('[Delete Category] Error updating server:', updateError);
      return NextResponse.json(
        { error: 'Failed to delete category' },
        { status: 500 }
      );
    }

    // Delete all channels in this category
    const { error: channelsError } = await supabase
      .from('channels')
      .delete()
      .eq('serverid', serverId)
      .eq('categoryid', categoryId);

    if (channelsError) {
      console.error('[Delete Category] Error deleting channels:', channelsError);
      // Continue anyway, the category is still deleted
    }

    console.log('[DeleteCategory] Success! Category and its channels deleted:', categoryId);

    return NextResponse.json({
      success: true,
      categoryId
    });

  } catch (error) {
    console.error('[Delete Category] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
