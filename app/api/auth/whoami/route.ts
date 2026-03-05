import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';

export async function GET() {
  const cookieStore = await cookies();
  const cookieNames = cookieStore.getAll().map((cookie) => cookie.name);
  const supabaseCookieNames = cookieNames.filter((name) => name.startsWith('drifd-auth') || name.startsWith('sb-') || name.includes('supabase'));

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message, cookieNames, supabaseCookieNames },
      { status: 200 },
    );
  }

  return NextResponse.json(
    {
      ok: Boolean(user),
      user: user
        ? {
            id: user.id,
            email: user.email,
          }
        : null,
      cookieNames,
      supabaseCookieNames,
    },
    { status: 200 },
  );
}
