import { ChatRoom } from '@/components/chat/chat-room';
import { MediaRoom } from '@/components/media/media-room';
import { RememberLastTextChannel } from '@/components/navigation/remember-last-text-channel';
import { MemberPanel } from '@/components/server/member-panel';
import { ChannelLayoutClient } from '@/components/server/channel-layout-client';
import { createClient } from '@/utils/supabase/server';

// Disable caching for profile data freshness
export const revalidate = 0;

interface ChannelPageProps {
  params: Promise<{ serverId: string; channelId: string }>;
}

type ChannelRecord = {
  id: string;
  name: string;
  type: 'TEXT' | 'AUDIO' | 'VIDEO';
};

type MemberRecord = {
  id: string;
  role: 'ADMIN' | 'MODERATOR' | 'GUEST';
  profileid: string;
};

type ProfileRecord = {
  id: string;
  username: string;
  imageurl: string | null;
  status?: string | null;
  last_seen?: string | null;
};

export default async function ChannelPage({ params }: ChannelPageProps) {
  const { serverId, channelId } = await params;
  const supabase = await createClient();

  // Check both session and user
  const [
    { data: { session } },
    { data: { user } },
  ] = await Promise.all([
    supabase.auth.getSession(),
    supabase.auth.getUser(),
  ]);

  if (!user || !session) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="rounded-lg bg-drifd-secondary p-8 text-center">
          <h2 className="mb-2 text-xl font-bold text-white">Authentication Required</h2>
          <p className="mb-4 text-sm text-drifd-muted">Please sign in to view this channel.</p>
          <a
            href="/"
            className="inline-block rounded-md bg-drifd-primary px-4 py-2 text-sm font-semibold text-black hover:opacity-90"
          >
            Go to Login
          </a>
        </div>
      </div>
    );
  }

  const [{ data: channelData }, { data: memberData }] = await Promise.all([
    supabase.from('channels').select('id, name, type').eq('id', channelId).single(),
    supabase.from('members').select('id, role, profileid').eq('serverid', serverId).order('created_at', { ascending: true }),
  ]);

  const channel = channelData as ChannelRecord | null;
  const members = (memberData as MemberRecord[] | null) ?? [];
  const currentMember = members.find((member) => member.profileid === user.id) ?? null;

  const profileIds = members.map((member) => member.profileid);
  const { data: profileData } = profileIds.length > 0
    ? await supabase.from('profiles').select('id, username, imageurl, status, last_seen').in('id', profileIds)
    : { data: null };
  const profileMap = new Map(((profileData as ProfileRecord[] | null) ?? []).map((profile) => [profile.id, profile]));

  const displayMembers = members.length
    ? members.map((member) => {
        const profile = profileMap.get(member.profileid);
        
        if (!profile) {
          // If profile not found, member might be orphaned - skip or use placeholder
          return {
            id: member.id,
            profileId: member.profileid,
            role: member.role,
            username: 'Unknown User',
            imageurl: null,
            status: 'offline' as const,
          };
        }
        
        // Check if user is actually online (last_seen within 2 minutes)
        const lastSeenDate = profile.last_seen ? new Date(profile.last_seen) : null;
        const now = new Date();
        const isRecentlyActive = lastSeenDate && (now.getTime() - lastSeenDate.getTime() < 120000);
        
        // Map status: invisible or inactive → offline, otherwise use actual status
        const rawStatus = profile.status || 'online';
        let displayStatus = rawStatus;
        if (rawStatus === 'invisible' || !isRecentlyActive) {
          displayStatus = 'offline';
        }
        
        return {
          id: member.id,
          profileId: member.profileid,
          role: member.role,
          username: profile.username,
          imageurl: profile.imageurl,
          status: displayStatus as 'online' | 'idle' | 'dnd' | 'offline',
        };
      })
    : [
        { id: 'm1', profileId: 'demo-profile-1', role: 'ADMIN' as const, username: 'DemoUser', imageurl: null, status: 'online' as const },
        { id: 'm2', profileId: 'demo-profile-2', role: 'MODERATOR' as const, username: 'SkyWalker', imageurl: null, status: 'idle' as const },
        { id: 'm3', profileId: 'demo-profile-3', role: 'GUEST' as const, username: 'DartVader', imageurl: null, status: 'offline' as const },
      ];

  const authorsByMemberId = Object.fromEntries(
    displayMembers.map((member) => [
      member.id,
      {
        username: member.username,
        avatarUrl: member.imageurl,
        profileId: member.profileId,
      },
    ]),
  );

  if (!channel || !currentMember) {
    return (
      <ChannelLayoutClient
        channelId="demo-general"
        channelName="general"
        memberId={displayMembers[0].id}
        authorsByMemberId={authorsByMemberId}
        channelType="TEXT"
        isAdmin={false}
        serverId={serverId}
        members={displayMembers}
      />
    );
  }

  if (channel.type !== 'TEXT') {
    return <MediaRoom channelId={channel.id} channelName={channel.name} channelType={channel.type} />;
  }

  return (
    <>
      <RememberLastTextChannel serverId={serverId} channelId={channel.id} enabled={true} />
      <ChannelLayoutClient
        channelId={channel.id}
        channelName={channel.name}
        memberId={currentMember.id}
        authorsByMemberId={authorsByMemberId}
        channelType={channel.type}
        isAdmin={currentMember.role === 'ADMIN' || currentMember.role === 'MODERATOR'}
        serverId={serverId}
        members={displayMembers}
      />
    </>
  );
}
