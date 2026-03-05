import { ServerSidebarClient } from '@/components/server/server-sidebar-client';

// Disable caching for profile data freshness
export const revalidate = 0;

interface ServerLayoutProps {
  children: React.ReactNode;
  params: Promise<{ serverId: string }>;
}

export default async function ServerLayout({ children, params }: ServerLayoutProps) {
  const { serverId } = await params;

  return (
    <div className="flex min-h-screen w-full bg-drifd-bg text-drifd-text">
      <ServerSidebarClient serverId={serverId} />
      <main className="flex-1 bg-drifd-tertiary">{children}</main>
    </div>
  );
}
