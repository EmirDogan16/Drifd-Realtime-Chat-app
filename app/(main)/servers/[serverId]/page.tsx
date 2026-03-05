interface ServerHomePageProps {
  params: Promise<{ serverId: string }>;
}

type ChannelRef = {
  id: string;
};

export default async function ServerHomePage({ params }: ServerHomePageProps) {
  const { serverId } = await params;

  const { createClient } = await import('@/utils/supabase/server');
  const supabase = await createClient();

  const { data: generalTextChannel } = await supabase
    .from('channels')
    .select('id')
    .eq('serverid', serverId)
    .eq('type', 'TEXT')
    .ilike('name', 'general')
    .limit(1)
    .maybeSingle();

  const general = generalTextChannel as ChannelRef | null;

  const { data: firstTextChannel } = general?.id
    ? { data: null }
    : await supabase
        .from('channels')
        .select('id')
        .eq('serverid', serverId)
        .eq('type', 'TEXT')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

  const firstText = (firstTextChannel as ChannelRef | null) ?? null;
  const fallbackChannelId = general?.id ?? firstText?.id ?? null;

  const { ServerHomeRedirect } = await import('@/components/navigation/server-home-redirect');

  if (fallbackChannelId) {
    return <ServerHomeRedirect serverId={serverId} fallbackChannelId={fallbackChannelId} />;
  }

  return (
    <section className="flex h-screen items-center justify-center px-8 text-center">
      <div className="max-w-xl rounded-lg border border-drifd-divider bg-drifd-secondary p-6">
        <h1 className="mb-2 text-2xl font-bold text-white">Drifd Server</h1>
        <p className="text-sm text-drifd-muted">
          Server <span className="font-mono text-drifd-text">{serverId}</span> yüklendi. Soldan bir kanal seçerek sohbete devam et.
        </p>
      </div>
    </section>
  );
}
