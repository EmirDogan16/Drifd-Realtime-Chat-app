'use client';

import { useState, useEffect } from 'react';
import { AddFriendForm } from '@/components/friends/add-friend-form';
import { FriendRequestList } from '@/components/friends/friend-request-list';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';

type Tab = 'all' | 'online' | 'pending' | 'add';

interface FriendData {
  friendshipId: string;
  friendId: string;
  friend: {
    id: string;
    username: string;
    imageurl: string | null;
    status?: 'online' | 'idle' | 'dnd' | 'offline';
    last_seen?: string | null;
  };
}

interface FriendRequest {
  id: string;
  requester_id: string;
  requester: {
    id: string;
    username: string;
    imageurl: string | null;
  };
}

interface FriendsPageContentProps {
  friends: FriendData[];
  pendingRequests: FriendRequest[];
}

function getInitials(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const [first, second] = trimmed.split(/\s+/).filter(Boolean).slice(0, 2);
  return `${first?.[0] ?? ''}${second?.[0] ?? ''}`.toUpperCase() || trimmed[0]?.toUpperCase() || '?';
}

function getDisplayStatus(status?: string | null, lastSeen?: string | null): NonNullable<FriendData['friend']['status']> {
  const lastSeenDate = lastSeen ? new Date(lastSeen) : null;
  const isRecentlyActive = lastSeenDate && (Date.now() - lastSeenDate.getTime() < 120000);

  if (status === 'invisible' || !isRecentlyActive) return 'offline';
  if (status === 'idle' || status === 'dnd') return status;
  return 'online';
}

function statusColor(status?: FriendData['friend']['status']) {
  if (status === 'online') return 'bg-green-500';
  if (status === 'idle') return 'bg-yellow-500';
  if (status === 'dnd') return 'bg-red-500';
  return 'bg-gray-500';
}

function statusLabel(status?: FriendData['friend']['status']) {
  if (status === 'online') return 'Çevrimiçi';
  if (status === 'idle') return 'Boşta';
  if (status === 'dnd') return 'Rahatsız Etmeyin';
  return 'Çevrimdışı';
}

export function FriendsPageContent({ friends, pendingRequests }: FriendsPageContentProps) {
  const [activeTab, setActiveTab] = useState<Tab>('all');
  const [friendsData, setFriendsData] = useState<FriendData[]>(friends);
  const [pendingData, setPendingData] = useState<FriendRequest[]>(pendingRequests);
  const [openMoreMenuFriendshipId, setOpenMoreMenuFriendshipId] = useState<string | null>(null);
  const [isRemovingFriendshipId, setIsRemovingFriendshipId] = useState<string | null>(null);

  // Poll for profile updates every 1 second
  useEffect(() => {
    const supabase = createClient();
    let active = true;
    let inFlight = false;
    
    const refreshProfiles = async () => {
      if (inFlight) return;
      if (friendsData.length === 0) return;
      inFlight = true;
      
      const friendIds = friendsData.map(f => f.friendId);
      
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, imageurl, status, last_seen')
        .in('id', friendIds);

      inFlight = false;
      
      if (!active || !profiles) return;
      
      // Update friends with fresh profile data
      setFriendsData(prev => {
        let hasChanges = false;
        const updated = prev.map(friendItem => {
          const profile: any = profiles.find((p: any) => p.id === friendItem.friendId);
          if (profile) {
            const displayStatus = getDisplayStatus(profile.status, profile.last_seen);
            if (
              friendItem.friend.username !== profile.username ||
              friendItem.friend.imageurl !== profile.imageurl ||
              friendItem.friend.status !== displayStatus ||
              friendItem.friend.last_seen !== profile.last_seen
            ) {
              hasChanges = true;
              return {
                ...friendItem,
                friend: {
                  ...friendItem.friend,
                  username: profile.username,
                  imageurl: profile.imageurl,
                  status: displayStatus,
                  last_seen: profile.last_seen
                }
              };
            }
          }
          return friendItem;
        });
        return hasChanges ? updated : prev;
      });
    };
    
    const interval = setInterval(() => {
      void refreshProfiles();
    }, 2000);
    
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [friendsData]);

  // Poll for pending request profile updates every 1 second
  useEffect(() => {
    const supabase = createClient();
    let active = true;
    let inFlight = false;
    
    const refreshPendingProfiles = async () => {
      if (inFlight) return;
      if (pendingData.length === 0) return;
      inFlight = true;
      
      const requesterIds = pendingData.map(r => r.requester_id);
      
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, imageurl')
        .in('id', requesterIds);

      inFlight = false;
      
      if (!active || !profiles) return;
      
      // Update pending requests with fresh profile data
      setPendingData(prev => {
        let hasChanges = false;
        const updated = prev.map(requestItem => {
          const profile: any = profiles.find((p: any) => p.id === requestItem.requester_id);
          if (profile) {
            if (requestItem.requester.username !== profile.username || requestItem.requester.imageurl !== profile.imageurl) {
              hasChanges = true;
              return {
                ...requestItem,
                requester: {
                  ...requestItem.requester,
                  username: profile.username,
                  imageurl: profile.imageurl
                }
              };
            }
          }
          return requestItem;
        });
        return hasChanges ? updated : prev;
      });
    };
    
    const interval = setInterval(() => {
      void refreshPendingProfiles();
    }, 2000);
    
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [pendingData]);

  // Poll pending friend requests every 2 seconds so incoming requests appear without refresh.
  useEffect(() => {
    let active = true;
    let inFlight = false;

    const refreshPendingRequests = async () => {
      if (inFlight) return;
      inFlight = true;

      const response = await fetch('/api/friends/pending', {
        method: 'GET',
        cache: 'no-store',
      }).catch(() => null);

      inFlight = false;

      if (!active || !response || !response.ok) return;

      const body = (await response.json().catch(() => ({}))) as { pendingRequests?: FriendRequest[] };
      const next = body.pendingRequests || [];

      setPendingData((prev) => {
        const prevSerialized = JSON.stringify(prev);
        const nextSerialized = JSON.stringify(next);
        return prevSerialized === nextSerialized ? prev : next;
      });
    };

    void refreshPendingRequests();

    const interval = setInterval(() => {
      void refreshPendingRequests();
    }, 2000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  // Poll accepted friends every 2 seconds so accepted requests appear in list without refresh.
  useEffect(() => {
    let active = true;
    let inFlight = false;

    const refreshFriends = async () => {
      if (inFlight) return;
      inFlight = true;

      const response = await fetch('/api/friends/list', {
        method: 'GET',
        cache: 'no-store',
      }).catch(() => null);

      inFlight = false;

      if (!active || !response || !response.ok) return;

      const body = (await response.json().catch(() => ({}))) as { friends?: FriendData[] };
      const next = body.friends || [];

      setFriendsData((prev) => {
        const prevSerialized = JSON.stringify(prev);
        const nextSerialized = JSON.stringify(next);
        return prevSerialized === nextSerialized ? prev : next;
      });
    };

    void refreshFriends();

    const interval = setInterval(() => {
      void refreshFriends();
    }, 2000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'online', label: 'Çevrimiçi' },
    { id: 'all', label: 'Tümü' },
    { id: 'pending', label: 'Bekleyen', badge: pendingData.length },
    { id: 'add', label: 'Arkadaş Ekle' },
  ];

  const onlineFriends = friendsData.filter(
    (item) => item.friend.status === 'online' || item.friend.status === 'idle' || item.friend.status === 'dnd'
  );

  useEffect(() => {
    if (!openMoreMenuFriendshipId) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('[data-friend-more-menu]') || target.closest('[data-friend-more-button]')) {
        return;
      }
      setOpenMoreMenuFriendshipId(null);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openMoreMenuFriendshipId]);

  const handleRemoveFriend = async (item: FriendData) => {
    if (isRemovingFriendshipId) return;

    const shouldRemove = window.confirm(`${item.friend.username} arkadaşlardan çıkarılsın mı?`);
    if (!shouldRemove) return;

    setIsRemovingFriendshipId(item.friendshipId);
    const supabase = createClient();

    const { error } = await supabase
      .from('friendships')
      .delete()
      .eq('id', item.friendshipId);

    if (error) {
      console.error('Arkadaş silinemedi:', error);
      alert('Arkadaş çıkarılırken bir hata oluştu.');
      setIsRemovingFriendshipId(null);
      return;
    }

    setFriendsData((prev) => prev.filter((friend) => friend.friendshipId !== item.friendshipId));
    setOpenMoreMenuFriendshipId(null);
    setIsRemovingFriendshipId(null);
  };

  return (
    <div className="flex h-full">
      {/* Main content area */}
      <div className="flex-1 flex flex-col">
        {/* Header with tabs */}
        <div className="h-12 px-4 flex items-center justify-center gap-4 border-b border-drifd-divider bg-drifd-secondary/40">
          <div className="flex items-center gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative px-2 py-1 rounded text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-drifd-hover text-white'
                    : 'text-drifd-muted hover:text-white hover:bg-drifd-hover/50'
                }`}
              >
                {tab.label}
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-red-500 text-white rounded-full">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto">
        {activeTab === 'add' && (
          <div className="max-w-3xl mx-auto p-6">
            <AddFriendForm />
          </div>
        )}

        {activeTab === 'pending' && (
          <div className="max-w-3xl mx-auto p-6">
            <FriendRequestList requests={pendingData} />
            {pendingData.length === 0 && (
              <div className="text-center py-12">
                <div className="text-4xl mb-4">📬</div>
                <h3 className="text-white font-semibold mb-2">Bekleyen istek yok</h3>
                <p className="text-drifd-muted text-sm">
                  Şu anda bekleyen arkadaşlık isteğin bulunmuyor
                </p>
              </div>
            )}
          </div>
        )}

        {(activeTab === 'all' || activeTab === 'online') && (
          <div className="max-w-3xl mx-auto p-6">
            <div className="mb-4 px-2">
              <input
                type="text"
                placeholder="Ara"
                className="w-full px-3 py-2 bg-[#1e1f22] border border-[#1e1f22] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#6F58F2] transition-colors"
              />
            </div>

            <div className="px-2 mb-2">
              <h3 className="text-xs font-semibold text-drifd-muted uppercase">
                {activeTab === 'all' ? `Tüm Arkadaşlar — ${friendsData.length}` : `Çevrimiçi — ${onlineFriends.length}`}
              </h3>
            </div>

            {activeTab === 'all' && friendsData.length === 0 && (
              <div className="text-center py-12">
                <div className="text-4xl mb-4">👋</div>
                <h3 className="text-white font-semibold mb-2">Arkadaş listesi boş</h3>
                <p className="text-drifd-muted text-sm">
                  Arkadaş ekleyerek sohbete başlayabilirsin
                </p>
              </div>
            )}

            {activeTab === 'online' && onlineFriends.length === 0 && (
              <div className="text-center py-12">
                <div className="text-4xl mb-4">😴</div>
                <h3 className="text-white font-semibold mb-2">Çevrimiçi arkadaş yok</h3>
                <p className="text-drifd-muted text-sm">
                  Arkadaşların çevrimiçi olduğunda burada görünecek
                </p>
              </div>
            )}

            {(activeTab === 'all' ? friendsData : onlineFriends).length > 0 && (
              <div className="border-t border-drifd-divider">
                {(activeTab === 'all' ? friendsData : onlineFriends).map((item) => (
                  <div
                    key={item.friendshipId}
                    className="flex items-center justify-between px-2 py-3 border-b border-drifd-divider hover:bg-drifd-hover/30 rounded group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-8 h-8 rounded-full bg-drifd-hover flex items-center justify-center overflow-hidden">
                          {item.friend.imageurl ? (
                            <img
                              src={item.friend.imageurl}
                              alt={item.friend.username}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-xs font-bold text-white">
                              {getInitials(item.friend.username)}
                            </span>
                          )}
                        </div>
                        <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-drifd-secondary ${statusColor(item.friend.status)}`} />
                      </div>
                      <div>
                        <div className="text-white font-medium">{item.friend.username}</div>
                        <div className="text-xs text-drifd-muted">{statusLabel(item.friend.status)}</div>
                      </div>
                    </div>
                    <div className="relative flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Link
                        href={`/direct-messages/${item.friendId}`}
                        className="p-2 bg-drifd-secondary hover:bg-drifd-hover rounded-full"
                        title="Mesaj gönder"
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-drifd-muted">
                          <path d="M4.79805 3C3.80445 3 2.99805 3.8055 2.99805 4.8V15.6C2.99805 16.5936 3.80445 17.4 4.79805 17.4H7.49805V21L11.098 17.4H19.198C20.1925 17.4 20.998 16.5936 20.998 15.6V4.8C20.998 3.8055 20.1925 3 19.198 3H4.79805Z" />
                        </svg>
                      </Link>
                      <button
                        type="button"
                        data-friend-more-button
                        onClick={() => setOpenMoreMenuFriendshipId((prev) => (prev === item.friendshipId ? null : item.friendshipId))}
                        className="p-2 bg-drifd-secondary hover:bg-drifd-hover rounded-full"
                        title="Daha fazla"
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-drifd-muted">
                          <path d="M12 16C13.1046 16 14 16.8954 14 18C14 19.1046 13.1046 20 12 20C10.8954 20 10 19.1046 10 18C10 16.8954 10.8954 16 12 16Z" />
                          <path d="M12 10C13.1046 10 14 10.8954 14 12C14 13.1046 13.1046 14 12 14C10.8954 14 10 13.1046 10 12C10 10.8954 10.8954 10 12 10Z" />
                          <path d="M12 4C13.1046 4 14 4.89543 14 6C14 7.10457 13.1046 8 12 8C10.8954 8 10 7.10457 10 6C10 4.89543 10.8954 4 12 4Z" />
                        </svg>
                      </button>

                      {openMoreMenuFriendshipId === item.friendshipId && (
                        <div
                          data-friend-more-menu
                          className="absolute right-0 top-11 z-40 min-w-[220px] bg-[#111214] rounded-xl shadow-xl border border-drifd-divider py-2"
                        >
                          <Link
                            href={`/direct-messages/${item.friendId}/call?mode=video&start=1`}
                            onClick={() => setOpenMoreMenuFriendshipId(null)}
                            className="w-full block px-3 py-2 text-left text-base text-drifd-text hover:bg-drifd-hover transition-colors"
                          >
                            Görüntülü Arama Başlat
                          </Link>
                          <Link
                            href={`/direct-messages/${item.friendId}/call?mode=audio&start=1`}
                            onClick={() => setOpenMoreMenuFriendshipId(null)}
                            className="w-full block px-3 py-2 text-left text-base text-drifd-text hover:bg-drifd-hover transition-colors"
                          >
                            Sesli Arama Başlat
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleRemoveFriend(item)}
                            disabled={isRemovingFriendshipId === item.friendshipId}
                            className="w-full px-3 py-2 text-left text-base text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Arkadaşı Çıkar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      </div>

      {/* Right sidebar - Active Now */}
      <aside className="w-64 border-l border-drifd-divider overflow-y-auto">
        <div className="p-4">
          <h3 className="text-xs font-semibold text-drifd-muted uppercase mb-4">Şimdi Aktif</h3>
          
          {onlineFriends.length > 0 ? (
            <div className="space-y-4">
              {onlineFriends.slice(0, 3).map((item) => (
                <div key={item.friendshipId} className="flex items-center gap-3 hover:bg-drifd-hover/20 p-2 rounded cursor-pointer">
                  <div className="relative flex-shrink-0">
                    <div className="w-10 h-10 rounded-full bg-drifd-hover flex items-center justify-center overflow-hidden">
                      {item.friend.imageurl ? (
                        <img
                          src={item.friend.imageurl}
                          alt={item.friend.username}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-sm font-bold text-white">
                          {getInitials(item.friend.username)}
                        </span>
                      )}
                    </div>
                    <span className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-drifd-secondary ${statusColor(item.friend.status)}`} />
                  </div>
                  <div className="flex-1 min-w-0 self-center">
                    <div className="text-white font-medium text-sm">{item.friend.username}</div>
                    <div className="text-xs text-drifd-muted">{statusLabel(item.friend.status)}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-2xl mb-2">💤</div>
              <p className="text-sm text-drifd-muted">Şu anda aktif arkadaş yok</p>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
