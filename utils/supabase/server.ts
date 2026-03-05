import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { headers } from 'next/headers';
import type { Database } from '@/types/supabase';

export async function createClient() {
  const cookieStore = await cookies();
  const headerStore = await headers();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  const cookieSecureOverride = process.env.NEXT_PUBLIC_COOKIE_SECURE;
  const forwardedProto = headerStore.get('x-forwarded-proto');
  const secure =
    cookieSecureOverride === 'true'
      ? true
      : cookieSecureOverride === 'false'
        ? false
        : forwardedProto === 'https';

  return createServerClient<Database, 'public', Database['public']>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set({ name, value, ...options }));
        } catch {
          // Server Components may not allow setting cookies; ignore.
        }
      },
    },
  });
}

// Admin client for bypassing RLS (use with caution!)
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return createSupabaseClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
