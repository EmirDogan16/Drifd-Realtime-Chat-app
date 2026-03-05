import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/utils/supabase/middleware';

export async function middleware(request: NextRequest) {
  try {
    return await updateSession(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error('[middleware] updateSession failed:', err);

    const response = NextResponse.next({ request });

    // Only surface details during local debugging.
    if (request.nextUrl.hostname === 'localhost' || request.nextUrl.hostname === '127.0.0.1') {
      response.headers.set('x-drifd-mw-error', message.slice(0, 200));
    }

    return response;
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
