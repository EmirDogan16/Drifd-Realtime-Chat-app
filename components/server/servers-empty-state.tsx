'use client';

import { useModalStore } from '@/hooks/use-modal-store';

export function ServersEmptyState() {
  const open = useModalStore((state) => state.open);

  return (
    <section className="flex h-screen flex-1 items-center justify-center px-8 text-center">
      <div className="max-w-xl rounded-lg border border-drifd-divider bg-drifd-secondary p-6">
        <h1 className="mb-2 text-2xl font-bold text-white">Drifd</h1>
        <p className="mb-5 text-sm text-drifd-muted">
          Henüz bir sunucun yok. Discord gibi çalışır: Sunucu oluştur, kanallar aç, sohbet et.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => open('createServer')}
            className="rounded-md bg-drifd-primary px-4 py-2 text-sm font-semibold text-black"
          >
            Sunucu Oluştur
          </button>
          <span className="text-xs text-drifd-muted">(Sol alttaki + ile de açılır)</span>
        </div>
      </div>
    </section>
  );
}
