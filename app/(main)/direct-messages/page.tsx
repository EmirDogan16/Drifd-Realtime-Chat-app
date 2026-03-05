import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { FriendsPageContent } from '@/components/friends/friends-page-content';

// Disable caching for profile data freshness
export const revalidate = 0;

export default async function DirectMessagesPage() {
  const supabase = await createClient();
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (sessionError || userError || !session || !user) {
    redirect('/');
  }

  // Get friends
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
    .eq('status', 'ACCEPTED')
    .order('created_at', { ascending: false });

  // Get pending friend requests (received)
  const { data: pendingRequests } = await supabase
    .from('friendships')
    .select(`
      id,
      requester_id,
      created_at,
      requester:profiles!friendships_requester_id_fkey(id, username, imageurl)
    `)
    .eq('addressee_id', user.id)
    .eq('status', 'PENDING')
    .order('created_at', { ascending: false });

  // Process friendships to show friends
  const friendList = (friendships as any)?.map((friendship: any) => {
    const friend = friendship.requester_id === user.id 
      ? friendship.addressee 
      : friendship.requester;
    return {
      friendshipId: friendship.id,
      friendId: friend.id,
      friend
    };
  }) || [];

  return <FriendsPageContent friends={friendList} pendingRequests={pendingRequests || []} />;
}
