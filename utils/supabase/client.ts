import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/supabase';

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  const cookieSecureOverride = process.env.NEXT_PUBLIC_COOKIE_SECURE;
  const secure =
    cookieSecureOverride === 'true'
      ? true
      : cookieSecureOverride === 'false'
        ? false
        : typeof window !== 'undefined'
          ? window.location.protocol === 'https:'
          : false;

  return createBrowserClient<Database, 'public', Database['public']>(supabaseUrl, supabaseAnonKey, {
    isSingleton: true,
  });
}
