import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { InviteAcceptClient } from './invite-accept-client.tsx';

interface InvitePageProps {
  params: Promise<{ inviteCode: string }>;
}

export default async function InvitePage({ params }: InvitePageProps) {
  const { inviteCode } = await params;
  const supabase = await createClient();

  // Get server info by invite code
  const { data: server, error: serverError } = await supabase
    .from('servers')
    .select('id, name, imageurl')
    .eq('invitecode', inviteCode)
    .single();

  if (serverError || !server) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-drifd-bg">
        <div className="max-w-md w-full mx-4">
          <div className="bg-drifd-primary rounded-lg shadow-xl p-8 text-center">
            <h1 className="text-3xl font-bold text-red-400 mb-4">Davetiye Geçersiz</h1>
            <p className="text-drifd-muted mb-6">
              Bu davet linki geçersiz veya süresi dolmuş olabilir.
            </p>
            <a
              href="/"
              className="inline-block px-6 py-3 bg-[#6F58F2] hover:bg-[#5f4ad9] text-white rounded-md font-semibold transition-colors"
            >
              Ana Sayfaya Dön
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Check if user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Redirect to auth with return URL
    redirect(`/?returnTo=/invite/${inviteCode}`);
  }

  // Check if user is already a member
  const { data: existingMember } = await supabase
    .from('members')
    .select('id')
    .eq('serverid', (server as any).id)
    .eq('profileid', user.id)
    .maybeSingle();

  if (existingMember) {
    // User is already a member, redirect to server
    redirect(`/servers/${(server as any).id}`);
  }

  // Pass initial memberCount as 1 (at least owner exists)
  // Actual count will be fetched client-side from API
  const memberCount = 1;

  return (
    <InviteAcceptClient
      serverId={(server as any).id}
      serverName={(server as any).name}
      serverImage={(server as any).imageurl}
      memberCount={memberCount}
      inviteCode={inviteCode}
    />
  );
}
