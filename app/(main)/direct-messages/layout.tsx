import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import Link from 'next/link';
import { UserVoicePanel } from '@/components/navigation/user-voice-panel';
import { DMFriendsList } from '@/components/navigation/dm-friends-list';

// Disable caching for profile data freshness
export const revalidate = 0;
export const dynamic = 'force-dynamic';

export default async function DirectMessagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (sessionError || userError || !session || !user) {
    redirect('/');
  }

  // Get current user's profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, imageurl')
    .eq('id', user.id)
    .single() as { data: { id: string; username: string; imageurl: string | null } | null };

  // Get all accepted friendships
  const { data: friendships } = await supabase
    .from('friendships')
    .select(`
      id,
      requester_id,
      addressee_id,
      status,
      requester:profiles!friendships_requester_id_fkey(id, username, imageurl),
      addressee:profiles!friendships_addressee_id_fkey(id, username, imageurl)
    `)
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
    .eq('status', 'ACCEPTED');

  // Get DM channels with latest messages
  const { data: dmChannels } = await supabase
    .from('dm_channels')
    .select('id, profile_one_id, profile_two_id, last_message_at')
    .or(`profile_one_id.eq.${user.id},profile_two_id.eq.${user.id}`);

  const dmChannelIds = ((dmChannels as any) || []).map((channel: any) => channel.id as string);
  const latestMessageByChannelId = new Map<string, string>();

  if (dmChannelIds.length > 0) {
    // Fallback for environments where dm_channels.last_message_at is not reliably updated.
    const { data: dmMessages } = await supabase
      .from('dm_channel_messages')
      .select('dm_channel_id, created_at')
      .in('dm_channel_id', dmChannelIds)
      .order('created_at', { ascending: false });

    (dmMessages as any)?.forEach((message: any) => {
      if (!latestMessageByChannelId.has(message.dm_channel_id)) {
        latestMessageByChannelId.set(message.dm_channel_id, message.created_at);
      }
    });
  }

  // Create a map of friend_id -> channel metadata
  const dmMap = new Map<string, { channelId: string; lastMessageAt: string | null }>();
  (dmChannels as any)?.forEach((channel: any) => {
    const friendId = channel.profile_one_id === user.id 
      ? channel.profile_two_id 
      : channel.profile_one_id;
    const persistedLastMessageAt = channel.last_message_at || latestMessageByChannelId.get(channel.id) || null;
    dmMap.set(friendId, {
      channelId: channel.id,
      lastMessageAt: persistedLastMessageAt,
    });
  });

  // Process friendships and merge with DM data
  const friendList = (friendships as any)?.map((friendship: any) => {
    const friend = friendship.requester_id === user.id 
      ? friendship.addressee 
      : friendship.requester;
    return {
      friendshipId: friendship.id,
      friendId: friend.id,
      friend,
      dmChannelId: dmMap.get(friend.id)?.channelId || null,
      lastMessageAt: dmMap.get(friend.id)?.lastMessageAt || null
    };
  }) || [];

  // Sort by last message time (most recent first), then by friendship creation
  friendList.sort((a: any, b: any) => {
    if (a.lastMessageAt && b.lastMessageAt) {
      return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
    }
    if (a.lastMessageAt) return -1;
    if (b.lastMessageAt) return 1;
    return 0;
  });

  return (
    <div className="flex h-full flex-1 overflow-hidden">
      {/* Left Sidebar - Friends List */}
      <aside className="hidden md:flex h-full w-72 flex-col border-r border-drifd-divider bg-drifd-secondary" style={{ overflow: 'visible' }}>
        {/* Friends List */}
        <div className="flex-1 overflow-y-auto">{/* Arkadaşlar Button */}
          <Link
            href="/direct-messages"
            className="mx-2 mt-2 mb-1 px-2 py-2 rounded hover:bg-drifd-hover cursor-pointer flex items-center gap-3 text-white group"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="text-drifd-muted group-hover:text-white transition-colors">
              <path d="M14 8.00598C14 10.211 12.206 12.006 10 12.006C7.795 12.006 6 10.211 6 8.00598C6 5.80098 7.794 4.00598 10 4.00598C12.206 4.00598 14 5.80098 14 8.00598ZM2 19.006C2 15.473 5.29 13.006 10 13.006C14.711 13.006 18 15.473 18 19.006V20.006H2V19.006Z"/>
              <path d="M14 8.00598C14 10.211 12.206 12.006 10 12.006C7.795 12.006 6 10.211 6 8.00598C6 5.80098 7.794 4.00598 10 4.00598C12.206 4.00598 14 5.80098 14 8.00598ZM2 19.006C2 15.473 5.29 13.006 10 13.006C14.711 13.006 18 15.473 18 19.006V20.006H2V19.006Z"/>
              <path d="M20.0001 20.006H22.0001V19.006C22.0001 16.4433 20.2697 14.4415 17.5213 13.5352C19.0621 14.4354 20.0001 16.0891 20.0001 18.006V20.006Z"/>
              <path d="M14.8834 11.9077C16.6657 11.5044 18.0001 9.9077 18.0001 8.00598C18.0001 5.80098 16.206 4.00598 14.0001 4.00598C13.4693 4.00598 12.9649 4.10857 12.5026 4.29361C13.3996 5.22331 14.0001 6.54725 14.0001 8.00598C14.0001 9.50098 13.3749 10.8453 12.4352 11.7852C13.0892 11.9112 13.9751 11.9853 14.8834 11.9077Z"/>
            </svg>
            <span className="text-sm font-medium">Friends</span>
          </Link>

          <div className="px-2 py-2">
            <div className="text-xs font-semibold text-drifd-muted uppercase px-2 mb-1">
              DIRECT MESSAGES
            </div>
            <DMFriendsList friends={friendList} />
          </div>
        </div>

        {/* User Voice Panel */}
        {profile && (
          <div className="border-t border-drifd-divider px-2 py-2" style={{ position: 'relative', zIndex: 10, overflow: 'visible' }}>
            <UserVoicePanel profileId={profile.id} username={profile.username} imageUrl={profile.imageurl} />
          </div>
        )}
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
