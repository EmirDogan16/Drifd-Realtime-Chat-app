'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { UserVoicePanel } from '@/components/navigation/user-voice-panel';
import { ServerHeader } from '@/components/server/server-header';
import { ChannelSectionHeader } from '@/components/server/channel-section-header';
import { DraggableChannelList } from '@/components/server/draggable-channel-list';
import { DraggableVoiceChannelList } from '@/components/server/draggable-voice-channel-list';
import { DraggableCategorySection } from '@/components/server/draggable-category-section';
import { usePathname } from 'next/navigation';
import { DndContext, closestCenter, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';

interface ServerSidebarClientProps {
  serverId: string;
}

type ServerRecord = {
  name: string;
  profileid: string;
  invitecode: string;
  category_order?: string[];
  category_names?: Record<string, string>;
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
  categoryid?: string | null;
};

type ProfileRecord = {
  id: string;
  username: string;
  imageurl: string | null;
};

export function ServerSidebarClient({ serverId }: ServerSidebarClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [server, setServer] = useState<ServerRecord | null>(null);
  const [channels, setChannels] = useState<ChannelRecord[]>([]);
  const channelsRef = useRef<ChannelRecord[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [categoryOrder, setCategoryOrder] = useState<string[]>(['category-text', 'category-audio']);
  const categoryOrderRef = useRef<string[]>(['category-text', 'category-audio']);
  const [categoryNames, setCategoryNames] = useState<Record<string, string>>({});
  const isDraggingCategoryRef = useRef(false);
  const isDraggingChannelRef = useRef(false);
  const currentUserIdRef = useRef<string | null>(null);

  // Sensor for category dragging - requires minimum distance to avoid conflicts
  const categorySensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Category order is now loaded from server in loadData, no localStorage needed

  // Extract current channelId from pathname
  const currentChannelId = pathname?.includes('/channels/') 
    ? pathname.split('/channels/')[1]?.split('/')[0] 
    : undefined;

  const loadData = async () => {
    setLoading(true);
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      currentUserIdRef.current = user.id;
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, username, imageurl')
        .eq('id', user.id)
        .maybeSingle();
      setProfile(profileData as ProfileRecord | null);

      // Check if user is banned from this server
      if (profileData) {
        const profileId = (profileData as { id?: string } | null)?.id;
        if (!profileId) {
          window.location.href = '/';
          return;
        }
        const { data: banData } = await supabase
          .from('banned_users')
          .select('id')
          .eq('serverid', serverId)
          .eq('profileid', profileId)
          .maybeSingle();

        if (banData) {
          console.warn('[ServerSidebar] User is banned from this server');
          window.location.href = '/';
          return;
        }
      }
    }

    const [{ data: serverData }, { data: channelsData, error: channelsError }] = await Promise.all([
      supabase.from('servers').select('name, profileid, invitecode, category_order, category_names').eq('id', serverId).single(),
      supabase.from('channels').select('id, name, type, position, categoryid').eq('serverid', serverId).order('position', { ascending: true }),
    ]);

    if (channelsError) {
      console.error('Error loading channels:', channelsError);
    }

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

      // If not a member anymore (kicked/banned), redirect to home
      if (!currentMember) {
        console.warn('[ServerSidebar] User is not a member, redirecting to home');
        window.location.href = '/';
        return;
      }
    }

    const serverRecord = serverData as ServerRecord | null;
    setServer(serverRecord);
    setIsOwner(serverRecord?.profileid === user?.id);
    setIsAdmin(currentMember?.role === 'ADMIN' || currentMember?.role === 'MODERATOR');
    const newChannels = (channelsData as ChannelRecord[] | null) ?? [];
    setChannels(newChannels);
    channelsRef.current = newChannels;
    
    // Load category order from server
    const newCategoryOrder = serverRecord?.category_order ?? ['category-text', 'category-audio'];
    setCategoryOrder(newCategoryOrder);
    categoryOrderRef.current = newCategoryOrder;
    
    // Load category names from server
    const newCategoryNames = serverRecord?.category_names ?? {};
    setCategoryNames(newCategoryNames);
    
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    
    // Listen for channel creation events
    const handleChannelCreated = () => {
      loadData();
    };
    
    // Listen for channel reorder events
    const handleChannelReordered = () => {
      loadData();
    };
    
    // Listen for category update/delete events
    const handleCategoryUpdated = () => {
      loadData();
    };
    
    const handleCategoryDeleted = () => {
      loadData();
    };
    
    window.addEventListener('channelCreated', handleChannelCreated);
    window.addEventListener('channelReordered', handleChannelReordered);
    window.addEventListener('categoryUpdated', handleCategoryUpdated);
    window.addEventListener('categoryDeleted', handleCategoryDeleted);

    // Polling: keep light to avoid request saturation during voice usage
    const pollingInterval = setInterval(async () => {
      const supabase = createClient();
      const currentUserId = currentUserIdRef.current;
      
      // Check if current user is still a member (catches bans and kicks)
      if (currentUserId) {
        const { data: memberData } = await supabase
          .from('members')
          .select('id')
          .eq('serverid', serverId)
          .eq('profileid', currentUserId)
          .maybeSingle();

        if (!memberData) {
          console.warn('[ServerSidebar] User is no longer a member, redirecting to home');
          clearInterval(pollingInterval);
          window.location.href = '/';
          return;
        }

        // Also check banned_users table (double check)
        const { data: banData } = await supabase
          .from('banned_users')
          .select('id')
          .eq('serverid', serverId)
          .eq('profileid', currentUserId)
          .maybeSingle();

        if (banData) {
          console.warn('[ServerSidebar] User is banned, redirecting to home');
          clearInterval(pollingInterval);
          window.location.href = '/';
          return;
        }
      }

      const [{ data: latestChannels, error: channelsError }, { data: latestServer, error: serverError }] = await Promise.all([
        supabase
          .from('channels')
          .select('id, name, type, position, categoryid')
          .eq('serverid', serverId)
          .order('position', { ascending: true }),
        supabase
          .from('servers')
          .select('category_order, category_names')
          .eq('id', serverId)
          .single(),
      ]);

      // If server query fails (server deleted or no access), redirect to home
      if (serverError) {
        console.warn('[ServerSidebar] Server no longer accessible, redirecting to home');
        clearInterval(pollingInterval);
        window.location.href = '/';
        return;
      }

      // If channels query fails, also redirect (likely means no member access)
      if (channelsError && channelsError.code !== 'PGRST116') { // PGRST116 = no rows, which is ok
        console.warn('[ServerSidebar] Channel access denied, redirecting to home');
        clearInterval(pollingInterval);
        window.location.href = '/';
        return;
      }

      if (latestChannels) {
        // Only update if channels changed (skip if currently dragging channels OR categories)
        if (!isDraggingChannelRef.current && !isDraggingCategoryRef.current) {
          // Compare all channel data (name, position, type)
          const currentHash = channelsRef.current.map(c => `${c.id}:${c.name}:${c.position}:${c.type}`).join('|');
          const newHash = latestChannels.map((c: any) => `${c.id}:${c.name}:${c.position}:${c.type}`).join('|');
          
          if (currentHash !== newHash) {
            const newChannels = latestChannels as ChannelRecord[];
            setChannels(newChannels);
            channelsRef.current = newChannels;
          }
        }
      }

      if (latestServer) {
        // Check if category order changed (skip if currently dragging)
        if (!isDraggingCategoryRef.current) {
          const serverCategoryOrder = (latestServer as any).category_order ?? ['category-text', 'category-audio'];
          const currentCategoryOrder = categoryOrderRef.current.join(',');
          const newCategoryOrder = serverCategoryOrder.join(',');
          
          if (currentCategoryOrder !== newCategoryOrder) {
            setCategoryOrder(serverCategoryOrder);
            categoryOrderRef.current = serverCategoryOrder;
          }

          // Check if category names changed
          const serverCategoryNames = (latestServer as any).category_names ?? {};
          const currentNamesHash = JSON.stringify(categoryNames);
          const newNamesHash = JSON.stringify(serverCategoryNames);
          
          if (currentNamesHash !== newNamesHash) {
            setCategoryNames(serverCategoryNames);
          }
        }
      }
    }, 10000); // Poll every 10 seconds
    
    return () => {
      window.removeEventListener('channelCreated', handleChannelCreated);
      window.removeEventListener('channelReordered', handleChannelReordered);
      window.removeEventListener('categoryUpdated', handleCategoryUpdated);
      window.removeEventListener('categoryDeleted', handleCategoryDeleted);
      clearInterval(pollingInterval);
    };
  }, [serverId, router]);

  const textChannels = channels
    .filter((ch) => ch.type === 'TEXT' && !ch.categoryid)
    .sort((a, b) => a.position - b.position);
  const audioChannels = channels
    .filter((ch) => (ch.type === 'AUDIO' || ch.type === 'VIDEO') && !ch.categoryid)
    .sort((a, b) => a.position - b.position);

  // Stable callbacks for channel drag operations
  const handleChannelDragStart = useCallback(() => {
    isDraggingChannelRef.current = true;
  }, []);

  const handleChannelDragEnd = useCallback(() => {
    setTimeout(() => {
      isDraggingChannelRef.current = false;
    }, 1000);
  }, []);

  const handleCategoryDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const oldIndex = categoryOrder.indexOf(active.id as string);
    const newIndex = categoryOrder.indexOf(over.id as string);
    const newOrder = arrayMove(categoryOrder, oldIndex, newIndex);
    const oldOrder = [...categoryOrder]; // Save old order for reverting

    // Set dragging flag to prevent polling override
    isDraggingCategoryRef.current = true;

    // Optimistic update
    setCategoryOrder(newOrder);
    categoryOrderRef.current = newOrder;

    // Send update to server
    try {
      const response = await fetch('/api/categories/reorder', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          serverId,
          categoryOrder: newOrder,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Category reorder failed:', response.status, errorData);
        throw new Error('Failed to update category order');
      }

      // Success - wait a bit before allowing polling to resume
      setTimeout(() => {
        isDraggingCategoryRef.current = false;
      }, 1000);
    } catch (error) {
      console.error('Error reordering categories:', error);
      // Revert to old order on error
      setCategoryOrder(oldOrder);
      categoryOrderRef.current = oldOrder;
      isDraggingCategoryRef.current = false;
    }
  };

  if (loading) {
    return (
      <aside className="flex h-screen w-72 flex-col border-r border-drifd-divider bg-drifd-secondary">
        <div className="flex items-center justify-center p-4">
          <div className="text-drifd-muted">Loading...</div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex h-screen w-72 flex-col border-r border-drifd-divider bg-drifd-secondary">
      <ServerHeader 
        serverName={server?.name ?? 'Server'} 
        serverId={serverId}
        inviteCode={server?.invitecode ?? ''}
        isOwner={isOwner}
        isAdmin={isAdmin}
      />

      <div className="flex-1 overflow-y-auto px-2 py-3">
        <DndContext
          sensors={categorySensors}
          collisionDetection={closestCenter}
          onDragEnd={handleCategoryDragEnd}
          modifiers={[restrictToVerticalAxis]}
        >
          <SortableContext items={categoryOrder} strategy={verticalListSortingStrategy}>
            {categoryOrder.map((categoryId) => {
              if (categoryId === 'category-text') {
                return (
                  <DraggableCategorySection key={categoryId} id={categoryId} canDrag={isAdmin || isOwner}>
                    <ChannelSectionHeader 
                      label="Text Channels" 
                      serverId={serverId} 
                      canManageChannels={isAdmin || isOwner}
                    />
                    <DraggableChannelList
                      channels={textChannels}
                      serverId={serverId}
                      channelType="TEXT"
                      categoryId="category-text"
                      currentChannelId={currentChannelId}
                      onDragStart={handleChannelDragStart}
                      onDragEnd={handleChannelDragEnd}
                    />
                  </DraggableCategorySection>
                );
              } else if (categoryId === 'category-audio') {
                return (
                  <DraggableCategorySection key={categoryId} id={categoryId} canDrag={isAdmin || isOwner}>
                    <ChannelSectionHeader 
                      label="Audio / Video" 
                      serverId={serverId} 
                      canManageChannels={isAdmin || isOwner}
                    />
                    <DraggableVoiceChannelList
                      channels={audioChannels}
                      serverId={serverId}
                      categoryId="category-audio"
                      onDragStart={handleChannelDragStart}
                      onDragEnd={handleChannelDragEnd}
                    />
                  </DraggableCategorySection>
                );
              } else {
                // Custom category
                const categoryName = categoryNames[categoryId] || 'Unknown Category';
                const categoryChannels = channels
                  .filter((ch) => ch.categoryid === categoryId)
                  .sort((a, b) => a.position - b.position);
                
                // Separate text and voice channels in this category
                const categoryTextChannels = categoryChannels.filter((ch) => ch.type === 'TEXT');
                const categoryVoiceChannels = categoryChannels.filter((ch) => ch.type === 'AUDIO' || ch.type === 'VIDEO');
                
                return (
                  <DraggableCategorySection key={categoryId} id={categoryId} canDrag={isAdmin || isOwner}>
                    <ChannelSectionHeader 
                      label={categoryName} 
                      serverId={serverId} 
                      canManageChannels={isAdmin || isOwner}
                      categoryId={categoryId}
                    />
                    {categoryTextChannels.length > 0 && (
                      <DraggableChannelList
                        channels={categoryTextChannels}
                        serverId={serverId}
                        channelType="TEXT"
                        categoryId={categoryId}
                        currentChannelId={currentChannelId}
                        onDragStart={handleChannelDragStart}
                        onDragEnd={handleChannelDragEnd}
                      />
                    )}
                    {categoryVoiceChannels.length > 0 && (
                      <DraggableVoiceChannelList
                        channels={categoryVoiceChannels}
                        serverId={serverId}
                        categoryId={categoryId}
                        onDragStart={handleChannelDragStart}
                        onDragEnd={handleChannelDragEnd}
                      />
                    )}
                  </DraggableCategorySection>
                );
              }
            })}
          </SortableContext>
        </DndContext>
      </div>

      {profile && (
        <div className="border-t border-drifd-divider px-2 py-2" style={{ position: 'relative', zIndex: 10, overflow: 'visible' }}>
          <UserVoicePanel profileId={profile.id} username={profile.username} imageUrl={profile.imageurl} />
        </div>
      )}
    </aside>
  );
}
