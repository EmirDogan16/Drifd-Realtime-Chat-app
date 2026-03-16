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
  const avatarFromAuth =
    (typeof user.user_metadata?.imageUrl === 'string' && user.user_metadata.imageUrl.trim()) ? user.user_metadata.imageUrl
    : (typeof user.user_metadata?.avatar_url === 'string' && user.user_metadata.avatar_url.trim()) ? user.user_metadata.avatar_url
    : (typeof user.user_metadata?.picture === 'string' && user.user_metadata.picture.trim()) ? user.user_metadata.picture
    : null;
  const buggyGeneratedUsername = `${usernameFromAuth}`.slice(0, 20) + '-' + user.id.slice(0, 4);

  const { data: currentProfile } = await supabase
    .schema('public')
    .from('profiles')
    .select('username, imageurl')
    .eq('id', user.id)
    .maybeSingle() as { data: { username?: string | null; imageurl?: string | null } | null };

  const profilePatch: { email: string; username?: string; imageurl?: string | null } = {
    email: user.email ?? `${user.id}@drifd.local`,
  };

  // Repair only obviously broken profile values from old ensure behavior.
  if (currentProfile?.username && currentProfile.username === buggyGeneratedUsername) {
    profilePatch.username = usernameFromAuth;
  }

  if ((!currentProfile?.imageurl || !currentProfile.imageurl.trim()) && avatarFromAuth) {
    profilePatch.imageurl = avatarFromAuth;
  }

  // Avoid `upsert` here: with RLS enabled, INSERT policy may be missing even though UPDATE is allowed.
  // The `handle_new_user` trigger should create the profile row; we just attempt a best-effort UPDATE.
  await supabase
    .schema('public')
    .from('profiles')
    .update(profilePatch)
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
