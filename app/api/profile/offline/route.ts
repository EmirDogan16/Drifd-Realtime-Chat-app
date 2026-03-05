import { createClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Set user status to offline
    await supabase
      .from('profiles')
      .update({ status: 'offline' })
      .eq('id', user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[ProfileOffline] Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
