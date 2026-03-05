import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { DMChatRoom } from '@/components/chat/dm-chat-room';

// Disable caching for profile data freshness
export const revalidate = 0;
export const dynamic = 'force-dynamic';

interface DirectMessageChatPageProps {
  params: {
    friendId: string;
  };
}

export default async function DirectMessageChatPage({ params }: DirectMessageChatPageProps) {
  const supabase = await createClient();
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (sessionError || userError || !session || !user) {
    redirect('/');
  }

  const { friendId } = await params;

  // Get friend profile
  const { data: friendProfile, error: friendError } = await supabase
    .from('profiles')
    .select('id, username, imageurl')
    .eq('id', friendId)
    .single();

  if (friendError || !friendProfile) {
    redirect('/direct-messages');
  }

  const friend = friendProfile as any;

  // Get or create DM channel
  let { data: dmChannel } = await supabase
    .from('dm_channels')
    .select('id')
    .or(`and(profile_one_id.eq.${user.id},profile_two_id.eq.${friendId}),and(profile_one_id.eq.${friendId},profile_two_id.eq.${user.id})`)
    .maybeSingle();

  // If no DM channel exists, create one
  if (!dmChannel) {
    const { data: newChannel, error: createError } = await supabase
      .from('dm_channels')
      .insert({
        profile_one_id: user.id,
        profile_two_id: friendId
      } as any)
      .select('id')
      .single();

    if (!createError && newChannel) {
      dmChannel = newChannel;
    }
  }

  const channel = dmChannel as any;

  return (
    <div className="flex flex-col flex-1 h-full overflow-hidden">
      {/* DM Header */}
      <header className="flex h-12 items-center justify-between border-b border-drifd-divider px-4 bg-drifd-secondary/40 flex-shrink-0">
        {/* Left: Friend avatar, username and online status */}
        <div className="flex items-center gap-3">
          {/* Friend avatar with online indicator */}
          <div className="relative flex-shrink-0">
            <div className="w-8 h-8 rounded-full bg-drifd-hover flex items-center justify-center overflow-hidden">
              {friend.imageurl ? (
                <img src={friend.imageurl} alt={friend.username} className="w-full h-full object-cover" />
              ) : (
                <span className="text-xs font-bold text-white">
                  {friend.username.slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-drifd-secondary" />
          </div>
          
          {/* Username and activity */}
          <div className="flex flex-col">
            <h2 className="text-base font-semibold text-white leading-tight">{friend.username}</h2>
            {/* Activity status - simulated for demo */}
            <div className="text-xs text-drifd-muted flex items-center gap-1">
              <span>🎮</span>
              <span>Minecraft oynuyor</span>
            </div>
          </div>
        </div>

        {/* Right: Action buttons and search */}
        <div className="flex items-center gap-2">
          {/* Voice call */}
          <button 
            className="p-2 text-drifd-muted hover:text-white hover:bg-drifd-hover rounded transition-colors"
            title="Sesli Arama"
          >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.383 3.07904C11.009 2.92504 10.579 3.01004 10.293 3.29604L6 8.00204H3C2.45 8.00204 2 8.45304 2 9.00204V15.002C2 15.552 2.45 16.002 3 16.002H6L10.293 20.71C10.579 20.996 11.009 21.082 11.383 20.927C11.757 20.772 12 20.407 12 20.002V4.00204C12 3.59904 11.757 3.23204 11.383 3.07904ZM14 5.00195V7.00195C16.757 7.00195 19 9.24595 19 12.002C19 14.759 16.757 17.002 14 17.002V19.002C17.86 19.002 21 15.863 21 12.002C21 8.14295 17.86 5.00195 14 5.00195ZM14 9.00195C15.654 9.00195 17 10.349 17 12.002C17 13.657 15.654 15.002 14 15.002V13.002C14.551 13.002 15 12.553 15 12.002C15 11.451 14.551 11.002 14 11.002V9.00195Z"/>
              </svg>
            </button>
            
            {/* Video call */}
            <button 
              className="p-2 text-drifd-muted hover:text-white hover:bg-drifd-hover rounded transition-colors"
              title="Görüntülü Arama"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21.526 8.149C21.231 7.966 20.862 7.951 20.553 8.105L18 9.382V7C18 5.897 17.103 5 16 5H4C2.897 5 2 5.897 2 7V17C2 18.104 2.897 19 4 19H16C17.103 19 18 18.104 18 17V14.618L20.553 15.894C20.694 15.965 20.847 16 21 16C21.183 16 21.365 15.949 21.526 15.851C21.82 15.668 22 15.347 22 15V9C22 8.653 21.82 8.332 21.526 8.149Z"/>
              </svg>
            </button>
            
            {/* Toggle user profile sidebar */}
            <button 
              className="p-2 text-drifd-muted hover:text-white hover:bg-drifd-hover rounded transition-colors"
              title="Kullanıcı Profilini Gizle"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.486 2 2 6.486 2 12C2 17.514 6.486 22 12 22C17.514 22 22 17.514 22 12C22 6.486 17.514 2 12 2ZM12 20C7.589 20 4 16.411 4 12C4 7.589 7.589 4 12 4C16.411 4 20 7.589 20 12C20 16.411 16.411 20 12 20Z"/>
                <path d="M12 6C8.691 6 6 8.691 6 12C6 15.309 8.691 18 12 18C15.309 18 18 15.309 18 12C18 8.691 15.309 6 12 6ZM12 16C9.794 16 8 14.206 8 12C8 9.794 9.794 8 12 8C14.206 8 16 9.794 16 12C16 14.206 14.206 16 12 16Z"/>
              </svg>
            </button>
            
            {/* Search */}
            <div className="relative ml-2">
              <input
                type="text"
                placeholder="Ara"
                className="w-36 px-2 py-1 text-sm bg-[#1e1f22] border border-[#1e1f22] rounded text-white placeholder-drifd-muted focus:outline-none focus:border-[#6F58F2] focus:w-60 transition-all"
              />
              <svg 
                className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-drifd-muted pointer-events-none" 
                viewBox="0 0 24 24" 
                fill="currentColor"
              >
                <path d="M21.707 20.293L16.314 14.9C17.403 13.504 18 11.799 18 10C18 7.863 17.167 5.854 15.656 4.344C14.146 2.832 12.137 2 10 2C7.863 2 5.854 2.832 4.344 4.344C2.833 5.854 2 7.863 2 10C2 12.137 2.833 14.146 4.344 15.656C5.854 17.168 7.863 18 10 18C11.799 18 13.504 17.404 14.9 16.314L20.293 21.706L21.707 20.293ZM10 16C8.397 16 6.891 15.376 5.758 14.243C4.624 13.11 4 11.603 4 10C4 8.398 4.624 6.891 5.758 5.758C6.891 4.624 8.397 4 10 4C11.603 4 13.109 4.624 14.242 5.758C15.376 6.891 16 8.398 16 10C16 11.603 15.376 13.11 14.242 14.243C13.109 15.376 11.603 16 10 16Z"/>
              </svg>
            </div>
          </div>
      </header>

      <DMChatRoom
        dmChannelId={channel.id}
        friendUsername={friend.username}
        friendAvatar={friend.imageurl}
        currentUserId={user.id}
        friendId={friendId}
      />
    </div>
  );
}
