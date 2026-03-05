import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { serverId, categoryOrder } = body;

    if (!serverId || !categoryOrder || !Array.isArray(categoryOrder)) {
      return NextResponse.json(
        { error: 'Missing or invalid serverId or categoryOrder' },
        { status: 400 }
      );
    }

    // Validate that the user is a member of the server (preferably admin/owner)
    const { data: member } = await supabase
      .from('members')
      .select('role, profileid')
      .eq('serverid', serverId)
      .eq('profileid', user.id)
      .maybeSingle();

    if (!member) {
      return NextResponse.json(
        { error: 'Not a member of this server' },
        { status: 403 }
      );
    }

    // Check if user is owner or admin
    const { data: server, error: serverError } = await supabase
      .from('servers')
      .select('profileid')
      .eq('id', serverId)
      .single();

    console.log('[Category Reorder] Server check:', { server, serverError });

    console.log('[Category Reorder] Server check:', { server, serverError });

    const isOwner = server?.profileid === user.id;
    const isAdmin = member.role === 'ADMIN' || member.role === 'MODERATOR';

    console.log('[Category Reorder] Permissions:', { isOwner, isAdmin, memberRole: member.role });

    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { error: 'Only admins and server owners can reorder categories' },
        { status: 403 }
      );
    }

    // Update category order in servers table
    const { data: updateData, error: updateError } = await supabase
      .from('servers')
      .update({ category_order: categoryOrder })
      .eq('id', serverId)
      .select('category_order');

    if (updateError) {
      console.error('Category reorder update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update category order', details: updateError.message },
        { status: 500 }
      );
    }

    if (!updateData || updateData.length === 0) {
      return NextResponse.json(
        { error: 'Failed to update - permission denied or server not found' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Category reorder error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
