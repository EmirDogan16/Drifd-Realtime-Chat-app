'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useModalStore } from '@/hooks/use-modal-store';

export function EditCategoryModal() {
  const { isOpen, type, onClose, data } = useModalStore();
  const [categoryName, setCategoryName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const isModalOpen = isOpen && type === 'editCategory';
  const { serverId, categoryId, categoryName: currentName } = data;

  useEffect(() => {
    if (isModalOpen && currentName) {
      setCategoryName(currentName);
    }
  }, [isModalOpen, currentName]);

  const handleClose = () => {
    setCategoryName('');
    setError('');
    onClose();
  };

  const handleUpdate = async () => {
    if (!categoryName.trim()) {
      setError('Kategori adı gerekli');
      return;
    }

    if (!serverId || !categoryId) {
      setError('Sunucu veya kategori bulunamadı');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/categories/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverId,
          categoryId,
          categoryName: categoryName.trim(),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Kategori güncellenemedi');
      }

      handleClose();
      
      // Refresh sidebar
      window.dispatchEvent(new Event('categoryUpdated'));
    } catch (err: any) {
      setError(err.message || 'Bir hata oluştu');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative w-full max-w-md rounded-lg bg-[#313338] p-6 shadow-xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Kategoriyi Düzenle</h2>
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="text-[#B5BAC1] hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Form */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#B5BAC1] uppercase mb-2">
              Kategori Adı
            </label>
            <input
              type="text"
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleUpdate()}
              disabled={isLoading}
              className="w-full rounded-md bg-[#1E1F22] px-3 py-2.5 text-[#DBDEE1] border-none focus:outline-none focus:ring-1 focus:ring-[#00A8FC]"
              placeholder="Kategori adı girin"
              maxLength={100}
              autoFocus
            />
          </div>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 -mx-6 -mb-6 px-6 py-4 bg-[#2B2D31] rounded-b-lg">
            <button
              onClick={handleClose}
              disabled={isLoading}
              className="rounded-md px-4 py-2 text-sm font-medium text-white hover:underline transition-colors"
            >
              İptal
            </button>
            <button
              onClick={handleUpdate}
              disabled={isLoading || !categoryName.trim()}
              className="rounded-md bg-[#5865F2] px-4 py-2 text-sm font-medium text-white hover:bg-[#4752C4] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Güncelleniyor...' : 'Güncelle'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
