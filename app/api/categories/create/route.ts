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

    const { serverId, categoryName } = await request.json();

    if (!serverId || !categoryName) {
      return NextResponse.json(
        { error: 'Server ID and category name are required' },
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
        { error: 'Not a member of this server' },
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
        { error: 'Only admins and server owners can create categories' },
        { status: 403 }
      );
    }

    // Generate a unique category ID
    const categoryId = `category-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Get current category order or initialize with defaults
    const currentOrder = (server as { category_order?: string[] }).category_order || ['category-text', 'category-audio'];
    
    // Get current category names or initialize
    const categoryNames = (server as { category_names?: Record<string, string> }).category_names || {};
    
    // Add new category name
    categoryNames[categoryId] = categoryName;
    
    console.log('[CreateCategory] Category ID:', categoryId);
    console.log('[CreateCategory] Category Name:', categoryName);
    console.log('[CreateCategory] All category names:', categoryNames);
    
    // Add new category after text channels but before voice channels
    const textIndex = currentOrder.indexOf('category-text');
    const insertPosition = textIndex >= 0 ? textIndex + 1 : 0;
    const newOrder = [
      ...currentOrder.slice(0, insertPosition),
      categoryId,
      ...currentOrder.slice(insertPosition)
    ];

    // Update server with new category order and names
    const updatePayload = { 
      category_order: newOrder,
      category_names: categoryNames
    };
    
    console.log('[CreateCategory] Updating server with:', updatePayload);
    
    const { error: updateError } = await supabase
      .from('servers')
      .update(updatePayload as any)
      .eq('id', serverId);

    if (updateError) {
      console.error('[Create Category] Error updating server:', updateError);
      return NextResponse.json(
        { error: 'Failed to create category' },
        { status: 500 }
      );
    }

    console.log('[CreateCategory] Success! Category created:', categoryId, categoryName);

    return NextResponse.json({
      success: true,
      categoryId,
      categoryName,
      order: newOrder
    });

  } catch (error) {
    console.error('[Create Category] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
