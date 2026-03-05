import { ServersEmptyState } from '@/components/server/servers-empty-state';
import { AuthScreen } from '@/components/auth/auth-screen';
import { createClient } from '@/utils/supabase/server';

export default async function ServersIndexPage() {
  const supabase = await createClient();
  
  // Check both session and user for reliable auth
  const [
    { data: { session } },
    { data: { user } },
  ] = await Promise.all([
    supabase.auth.getSession(),
    supabase.auth.getUser(),
  ]);

  if (!user || !session) {
    return <AuthScreen />;
  }

  return <ServersEmptyState />;
}
