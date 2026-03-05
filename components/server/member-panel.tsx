'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';

interface MemberItem {
  id: string;
  profileId: string;
  username: string;
  imageurl: string | null;
  role: 'ADMIN' | 'MODERATOR' | 'GUEST';
  status?: 'online' | 'idle' | 'dnd' | 'offline';
}

interface MemberPanelProps {
  members: MemberItem[];
  serverId: string;
}

function roleTitle(role: MemberItem['role']) {
  if (role === 'ADMIN') return 'OWNER';
  if (role === 'MODERATOR') return 'ADMINS';
  return 'MEMBERS';
}

function statusColor(status: MemberItem['status']) {
  if (status === 'online') return 'bg-green-500';
  if (status === 'idle') return 'bg-yellow-500';
  if (status === 'dnd') return 'bg-red-500';
  return 'bg-gray-500';
}

// Get initials from username
function getInitials(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const [first, second] = trimmed.split(/\s+/).filter(Boolean).slice(0, 2);
  return `${first?.[0] ?? ''}${second?.[0] ?? ''}`.toUpperCase() || trimmed[0]?.toUpperCase() || '?';
}

export function MemberPanel({ members: initialMembers, serverId }: MemberPanelProps) {
  const [members, setMembers] = useState(initialMembers);
  const lastProfileDataRef = useRef(
    new Map(initialMembers.map(m => [m.profileId, { username: m.username, imageurl: m.imageurl, status: m.status }]))
  );

  // Heartbeat: Refresh member list every 2 seconds to detect new joins
  useEffect(() => {
    const supabase = createClient();
    
    const refreshMemberList = async () => {
      const { data: serverMembers } = await supabase
        .from('members')
        .select(`
          id,
          role,
          profileid,
          profiles!inner (
            id,
            username,
            imageurl,
            status,
            last_seen
          )
        `)
        .eq('serverid', serverId);
      
      if (!serverMembers) return;
      
      // Map to MemberItem format
      const newMembers: MemberItem[] = (serverMembers as any[]).map((m: any) => {
        const profile = m.profiles;
        const lastSeenDate = profile.last_seen ? new Date(profile.last_seen) : null;
        const now = new Date();
        const isRecentlyActive = lastSeenDate && (now.getTime() - lastSeenDate.getTime() < 120000);
        
        let displayStatus = profile.status || 'online';
        if (profile.status === 'invisible' || !isRecentlyActive) {
          displayStatus = 'offline';
        }
        
        return {
          id: m.id,
          profileId: m.profileid,
          username: profile.username,
          imageurl: profile.imageurl,
          role: m.role,
          status: displayStatus
        };
      });
      
      // Update if member list changed (by ID)
      setMembers(prev => {
        const prevIds = new Set(prev.map(m => m.id));
        const newIds = new Set(newMembers.map(m => m.id));
        
        // Check if IDs are different
        if (prevIds.size !== newIds.size || [...prevIds].some(id => !newIds.has(id))) {
          return newMembers;
        }
        return prev;
      });
    };
    
    // Refresh every 2 seconds
    const heartbeat = setInterval(refreshMemberList, 2000);
    
    return () => {
      clearInterval(heartbeat);
    };
  }, [serverId]);

  // Poll member profile updates
  useEffect(() => {
    const supabase = createClient();
    
    const refreshMembers = async () => {
      const profileIds = members.map(m => m.profileId);
      if (profileIds.length === 0) return;

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, imageurl, status, last_seen')
        .in('id', profileIds);
      
      if (!profiles) return;
      
      // Update members with fresh profile data
      setMembers(prev => {
        let hasChanges = false;
        const updated = prev.map(member => {
          const profile = profiles.find((p: any) => p.id === member.profileId);
          if (profile) {
            const last = lastProfileDataRef.current.get(member.profileId);
            
            // Check if user is actually online (last_seen within 2 minutes)
            const lastSeenDate = profile.last_seen ? new Date(profile.last_seen) : null;
            const now = new Date();
            const isRecentlyActive = lastSeenDate && (now.getTime() - lastSeenDate.getTime() < 120000);
            
            // Map status: invisible or inactive → offline, otherwise use actual status
            let displayStatus = profile.status || 'online';
            if (profile.status === 'invisible' || !isRecentlyActive) {
              displayStatus = 'offline';
            }
            
            if (!last || profile.username !== last.username || profile.imageurl !== last.imageurl || displayStatus !== last.status) {
              hasChanges = true;
              lastProfileDataRef.current.set(member.profileId, { username: profile.username, imageurl: profile.imageurl, status: displayStatus });
              return {
                ...member,
                username: profile.username,
                imageurl: profile.imageurl,
                status: displayStatus
              };
            }
          }
          return member;
        });
        return hasChanges ? updated : prev;
      });
    };
    
    // Poll every 1 second for fast updates
    const interval = setInterval(refreshMembers, 1000);
    
    return () => {
      clearInterval(interval);
    };
  }, [members]);

  // Group by online status
  const onlineMembers = members.filter(
    (member) => member.status === 'online' || member.status === 'idle' || member.status === 'dnd'
  );
  const offlineMembers = members.filter(
    (member) => !member.status || member.status === 'offline'
  );

  const renderMemberList = (memberList: MemberItem[]) => (
    <div className="space-y-1">
      {memberList.map((member) => (
        <div key={member.id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-drifd-hover">
          <div className="relative h-9 w-9 flex-shrink-0 rounded-full bg-drifd-hover">
            {member.imageurl ? (
              <img src={member.imageurl} alt={member.username} className="h-full w-full rounded-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center rounded-full text-xs font-bold text-white">
                {getInitials(member.username)}
              </span>
            )}
            <span className={`absolute -bottom-0.5 -right-0.5 z-20 h-3.5 w-3.5 rounded-full border-[2.5px] border-drifd-secondary ${statusColor(member.status)}`} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm text-drifd-text">{member.username}</p>
            <p className="text-[10px] text-drifd-muted">{roleTitle(member.role)}</p>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <aside className="hidden w-64 border-l border-drifd-divider bg-drifd-secondary px-2 py-4 xl:block">
      {/* Online Members */}
      {onlineMembers.length > 0 && (
        <div className="mb-5">
          <p className="mb-2 px-2 text-xs font-bold uppercase tracking-wide text-drifd-muted">
            ONLINE — {onlineMembers.length}
          </p>
          {renderMemberList(onlineMembers)}
        </div>
      )}

      {/* Offline Members */}
      {offlineMembers.length > 0 && (
        <div className="mb-5">
          <p className="mb-2 px-2 text-xs font-bold uppercase tracking-wide text-drifd-muted">
            OFFLINE — {offlineMembers.length}
          </p>
          {renderMemberList(offlineMembers)}
        </div>
      )}
    </aside>
  );
}
