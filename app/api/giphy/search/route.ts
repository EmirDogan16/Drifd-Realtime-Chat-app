import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q');
  const limit = searchParams.get('limit') || '25';
  const offset = searchParams.get('offset') || '0';

  if (!query) {
    return NextResponse.json(
      { error: 'Query parameter is required' },
      { status: 400 }
    );
  }

  const apiKey = process.env.NEXT_PUBLIC_GIPHY_API_KEY;
  
  if (!apiKey) {
    return NextResponse.json(
      { error: 'GIPHY API key not configured' },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(
      `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`GIPHY API error: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error searching GIFs:', error);
    return NextResponse.json(
      { error: 'Failed to search GIFs' },
      { status: 500 }
    );
  }
}
