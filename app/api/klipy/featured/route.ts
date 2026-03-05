import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: NextRequest) {
  // Authentication check
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const limit = searchParams.get('limit') || '25';
  const pos = searchParams.get('pos') || '0';

  const apiKey = process.env.NEXT_PUBLIC_KLIPY_API_KEY;
  
  if (!apiKey) {
    return NextResponse.json(
      { error: 'KLIPY API key not configured' },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(
      `https://api.klipy.com/v2/featured?key=${apiKey}&limit=${limit}&pos=${pos}`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`KLIPY API error: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching featured GIFs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch featured GIFs' },
      { status: 500 }
    );
  }
}
