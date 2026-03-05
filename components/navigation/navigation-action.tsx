'use client';

import { Plus } from 'lucide-react';
import { useModalStore } from '@/hooks/use-modal-store';

export function NavigationAction() {
  const open = useModalStore((state) => state.open);

  return (
    <button
      onClick={() => open('createServer')}
      className="mb-2 flex h-12 w-12 items-center justify-center rounded-[24px] bg-drifd-secondary text-green-500 transition-all hover:rounded-2xl hover:bg-green-600 hover:text-white"
      title="Add Server"
    >
      <Plus size={22} />
    </button>
  );
}
