import { redirect } from 'next/navigation';
import { AuthScreen } from '@/components/auth/auth-screen';
import { createClient } from '@/utils/supabase/server';

type MemberRef = {
  serverid: string;
};

type ChannelRef = {
  id: string;
};

export default async function HomePage() {
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

  const usernameFromAuth =
    (typeof user.user_metadata?.username === 'string' && user.user_metadata.username.trim()) ||
    (user.email ? user.email.split('@')[0] : 'DrifdUser');

  // Avoid `upsert` here: with RLS enabled, INSERT policy may be missing even though UPDATE is allowed.
  // The `handle_new_user` trigger should create the profile row; we just attempt a best-effort UPDATE.
  await supabase
    .schema('public')
    .from('profiles')
    .update({
      email: user.email ?? `${user.id}@drifd.local`,
      username: usernameFromAuth,
    })
    .eq('id', user.id);

  const { data: membership } = await supabase
    .schema('public')
    .from('members')
    .select('serverid')
    .eq('profileid', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const member = membership as MemberRef | null;

  const serverId = member?.serverid ?? null;

  // If user is not in any server yet, land on /servers where they can create one.
  if (!serverId) {
    redirect('/servers');
  }

  if (serverId) {
    const { data: firstTextChannel } = await supabase
      .schema('public')
      .from('channels')
      .select('id')
      .eq('serverid', serverId)
      .eq('type', 'TEXT')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    const channel = firstTextChannel as ChannelRef | null;

    if (channel?.id) {
      redirect(`/servers/${serverId}/channels/${channel.id}`);
    }
    redirect(`/servers/${serverId}`);
  }

  redirect('/servers');
}
