import { ModalProvider } from '@/components/modals/modal-provider';
import { NavigationSidebar } from '@/components/navigation/navigation-sidebar';
import { createClient } from '@/utils/supabase/server';

// Disable caching for profile data freshness
export const revalidate = 0;

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <div className="min-h-screen bg-drifd-bg text-drifd-text">{children}</div>;
  }

  return (
    <div className="flex h-screen bg-drifd-bg text-drifd-text overflow-hidden">
      <NavigationSidebar />
      <div className="flex flex-1 overflow-hidden">{children}</div>
      <ModalProvider />
    </div>
  );
}
