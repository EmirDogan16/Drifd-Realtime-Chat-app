'use client';

import { NavigationAction } from '@/components/navigation/navigation-action';
import { NavigationItem } from '@/components/navigation/navigation-item';
import { createClient } from '@/utils/supabase/client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

type ServerRecord = {
  id: string;
  name: string;
  imageurl: string | null;
};

type MemberServerRef = {
  serverid: string;
};

export function NavigationSidebar() {
  const params = useParams();
  const activeServerId = params?.serverId as string | undefined;
  const [servers, setServers] = useState<ServerRecord[]>([]);

  useEffect(() => {
    const loadServers = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setServers([]);
        return;
      }

      const { data: memberRows } = await supabase
        .from('members')
        .select('serverid')
        .eq('profileid', user.id);

      const serverIds = ((memberRows as MemberServerRef[] | null) ?? []).map((row) => row.serverid);

      if (serverIds.length > 0) {
        const { data: serverRows } = await supabase
          .from('servers')
          .select('id, name, imageurl')
          .in('id', serverIds)
          .order('created_at', { ascending: true });

        setServers((serverRows as ServerRecord[] | null) ?? []);
      }
    };

    loadServers();
  }, []);

  return (
    <aside className="flex h-screen w-[72px] flex-col items-center overflow-y-auto bg-[#202225] py-3">
      <Link 
        href="/direct-messages"
        className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-drifd-primary text-sm font-bold text-black hover:rounded-xl transition-all cursor-pointer"
        title="Direkt Mesajlar"
      >
        D
      </Link>
      <div className="mb-2 h-[2px] w-8 rounded-lg bg-drifd-divider" />

      {servers.map((server) => (
        <NavigationItem
          key={server.id}
          id={server.id}
          imageUrl={server.imageurl}
          isActive={activeServerId === server.id}
          name={server.name}
        />
      ))}

      <div className="mb-2 mt-1 h-[2px] w-8 rounded-lg bg-drifd-divider" />
      <NavigationAction />
    </aside>
  );
}
