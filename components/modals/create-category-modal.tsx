'use client';

import { useState, FormEvent } from 'react';
import { useModalStore } from '@/hooks/use-modal-store';
import { createClient } from '@/utils/supabase/client';
import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function CreateCategoryModal() {
  const router = useRouter();
  const { isOpen, type, data, close } = useModalStore();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  if (!isOpen || type !== 'createCategory') {
    return null;
  }

  const { serverId } = data;

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || !serverId) return;

    setLoading(true);
    setErrorText(null);

    try {
      const response = await fetch('/api/categories/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          serverId,
          categoryName: name.trim()
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setErrorText(result.error || 'Kategori oluşturulurken bir hata oluştu');
        setLoading(false);
        return;
      }

      setName('');
      close();
      router.refresh();
    } catch (error) {
      console.error('[Create Category] Error:', error);
      setErrorText('Kategori oluşturulurken bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setName('');
      setErrorText(null);
      close();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-drifd-secondary rounded-lg shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-drifd-divider">
          <h2 className="text-xl font-bold text-white">Kategori Oluştur</h2>
          <button
            onClick={handleClose}
            disabled={loading}
            className="text-drifd-muted hover:text-white transition-colors disabled:opacity-50"
          >
            <X size={24} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleCreate} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-drifd-muted mb-2">
              KATEGORİ ADI
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="yeni-kategori"
              disabled={loading}
              className="w-full px-3 py-2 bg-drifd-tertiary border border-drifd-divider rounded text-white placeholder-drifd-muted focus:outline-none focus:border-drifd-primary transition-colors disabled:opacity-50"
              maxLength={50}
              autoFocus
            />
          </div>

          {errorText && (
            <p className="text-sm text-red-400">{errorText}</p>
          )}

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white hover:underline disabled:opacity-50"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="px-4 py-2 bg-drifd-primary text-sm font-semibold text-black rounded hover:bg-drifd-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Oluşturuluyor...' : 'Oluştur'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
