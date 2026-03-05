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
    const { serverId, categoryId, categoryName } = body;

    if (!serverId || !categoryId || !categoryName) {
      return NextResponse.json(
        { error: 'Server ID, category ID, and category name are required' },
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
      .select('profileid, category_names')
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
        { error: 'Only admins and server owners can edit categories' },
        { status: 403 }
      );
    }

    // Update category name
    const categoryNames = (server as { category_names?: Record<string, string> }).category_names || {};
    categoryNames[categoryId] = categoryName.trim();

    const { error: updateError } = await supabase
      .from('servers')
      .update({ category_names: categoryNames } as any)
      .eq('id', serverId);

    if (updateError) {
      console.error('[Update Category] Error updating server:', updateError);
      return NextResponse.json(
        { error: 'Failed to update category' },
        { status: 500 }
      );
    }

    console.log('[UpdateCategory] Success! Category updated:', categoryId, categoryName);

    return NextResponse.json({
      success: true,
      categoryId,
      categoryName
    });

  } catch (error) {
    console.error('[Update Category] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
