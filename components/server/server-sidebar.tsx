import { createClient } from '@/utils/supabase/server';
import { UserVoicePanel } from '@/components/navigation/user-voice-panel';
import { ServerHeader } from '@/components/server/server-header';
import { ChannelSectionHeader } from '@/components/server/channel-section-header';
import { DraggableChannelList } from '@/components/server/draggable-channel-list';
import { DraggableVoiceChannelList } from '@/components/server/draggable-voice-channel-list';

interface ServerSidebarProps {
  serverId: string;
}

type ServerRecord = {
  name: string;
  profileid: string;
};

type MemberRecord = {
  role: 'ADMIN' | 'MODERATOR' | 'GUEST';
  profileid: string;
};

type ChannelRecord = {
  id: string;
  name: string;
  type: 'TEXT' | 'AUDIO' | 'VIDEO';
  position: number;
};

type ProfileRecord = {
  id: string;
  username: string;
  imageurl: string | null;
};

export async function ServerSidebar({ serverId }: ServerSidebarProps) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile: ProfileRecord | null = null;
  if (user) {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('id, username, imageurl')
      .eq('id', user.id)
      .maybeSingle();
    profile = profileData as ProfileRecord | null;
  }

  const [{ data: serverData }, { data: channels }] = await Promise.all([
    supabase.from('servers').select('name, profileid').eq('id', serverId).single(),
    supabase.from('channels').select('id, name, type, position').eq('serverid', serverId).order('position', { ascending: true }),
  ]);

  // Get current user's member info to check role
  let currentMember: MemberRecord | null = null;
  if (user) {
    const { data: memberData } = await supabase
      .from('members')
      .select('role, profileid')
      .eq('serverid', serverId)
      .eq('profileid', user.id)
      .maybeSingle();
    currentMember = memberData as MemberRecord | null;
  }

  const server = serverData as ServerRecord | null;
  const isOwner = server?.profileid === user?.id;
  const isAdmin = currentMember?.role === 'ADMIN' || currentMember?.role === 'MODERATOR';

  let channelsData = (channels as ChannelRecord[] | null) ?? null;

  // If the server already has channels but none are AUDIO/VIDEO, auto-create a default voice channel.
  // This avoids an empty "Audio / Video" section for existing servers.
  if ((channelsData ?? []).length > 0) {
    const hasMedia = (channelsData ?? []).some((channel) => channel.type === 'AUDIO' || channel.type === 'VIDEO');
    if (!hasMedia) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { error } = await supabase
          .schema('public')
          .from('channels')
          .insert({
            id: crypto.randomUUID(),
            name: 'voice',
            type: 'AUDIO',
            serverid: serverId,
            profileid: user.id,
          });

        if (!error) {
          const { data: refreshed } = await supabase
            .schema('public')
            .from('channels')
            .select('id, name, type')
            .eq('serverid', serverId)
            .order('created_at', { ascending: true });
          if (refreshed) {
            channelsData = refreshed as ChannelRecord[];
          }
        }
      }
    }
  }

  const normalizedChannels = ((channelsData ?? []) as ChannelRecord[]).length
    ? (channelsData as ChannelRecord[])
    : [
        // Use UUID-shaped placeholders to avoid routing into `/channels/:id` with an invalid UUID.
        // Channel page already falls back to demo UI when the channel isn't found.
        { id: '00000000-0000-0000-0000-000000000001', name: 'general', type: 'TEXT' as const, position: 0 },
        { id: '00000000-0000-0000-0000-000000000002', name: 'announcements', type: 'TEXT' as const, position: 1 },
        { id: '00000000-0000-0000-0000-000000000003', name: 'random', type: 'TEXT' as const, position: 2 },
        { id: '00000000-0000-0000-0000-000000000004', name: 'voice-chat', type: 'AUDIO' as const, position: 0 },
      ];
  const textChannels = normalizedChannels
    .filter((channel) => channel.type === 'TEXT')
    .sort((a, b) => a.position - b.position);
  const audioChannels = normalizedChannels
    .filter((channel) => channel.type === 'AUDIO' || channel.type === 'VIDEO')
    .sort((a, b) => a.position - b.position);

  return (
    <aside className="hidden h-screen w-72 flex-col border-r border-drifd-divider bg-drifd-secondary md:flex">
      <ServerHeader 
        serverName={server?.name ?? 'Server'} 
        serverId={serverId}
        inviteCode={(server as any)?.invitecode ?? ''}
        isOwner={isOwner}
        isAdmin={isAdmin}
      />

      <div className="flex-1 overflow-y-auto px-2 py-3">
        <div className="mb-4">
          <ChannelSectionHeader 
            label="Text Channels" 
            serverId={serverId} 
            canManageChannels={isAdmin || isOwner}
          />
          <DraggableChannelList
            channels={textChannels}
            serverId={serverId}
            channelType="TEXT"
          />
        </div>

        <div className="mb-4">
          <ChannelSectionHeader 
            label="Audio / Video" 
            serverId={serverId} 
            canManageChannels={isAdmin || isOwner}
          />
          <DraggableVoiceChannelList
            channels={audioChannels}
            serverId={serverId}
            channelType="AUDIO"
          />
        </div>
      </div>

      {profile && (
        <div className="border-t border-drifd-divider px-2 py-2" style={{ position: 'relative', zIndex: 10, overflow: 'visible' }}>
          <UserVoicePanel profileId={profile.id} username={profile.username} imageUrl={profile.imageurl} />
        </div>
      )}
    </aside>
  );
}
