'use client';

import { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { useModalStore } from '@/hooks/use-modal-store';

export function DeleteCategoryModal() {
  const { isOpen, type, onClose, data } = useModalStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const isModalOpen = isOpen && type === 'deleteCategory';
  const { serverId, categoryId, categoryName } = data;

  const handleClose = () => {
    setError('');
    onClose();
  };

  const handleDelete = async () => {
    if (!serverId || !categoryId) {
      setError('Sunucu veya kategori bulunamadı');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/categories/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverId,
          categoryId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Kategori silinemedi');
      }

      handleClose();
      
      // Refresh sidebar
      window.dispatchEvent(new Event('categoryDeleted'));
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
          <h2 className="text-xl font-bold text-white">Kategoriyi Sil</h2>
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="text-[#B5BAC1] hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Warning */}
        <div className="mb-4 flex items-start gap-3 rounded-md bg-[#2B2D31] p-3">
          <AlertTriangle size={20} className="text-[#F0B232] mt-0.5 flex-shrink-0" />
          <div className="text-sm text-[#DBDEE1]">
            <p className="font-semibold text-[#F0B232] mb-2">Dikkat!</p>
            <p className="mb-2">
              <span className="font-semibold text-white">{categoryName}</span> kategorisini silmek üzeresiniz.
            </p>
            <p className="text-[#B5BAC1]">
              Bu kategorideki tüm kanallar <span className="font-semibold text-white">kalıcı olarak silinecek</span> ve geri alınamaz.
            </p>
          </div>
        </div>

        {error && (
          <p className="mb-4 text-sm text-red-400">{error}</p>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 bg-[#2B2D31] -mx-6 -mb-6 px-6 py-4 rounded-b-lg">
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="rounded-md px-4 py-2 text-sm font-medium text-white hover:underline transition-colors"
          >
            İptal
          </button>
          <button
            onClick={handleDelete}
            disabled={isLoading}
            className="rounded-md bg-[#DA373C] px-4 py-2 text-sm font-medium text-white hover:bg-[#A12828] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Siliniyor...' : 'Kategoriyi Sil'}
          </button>
        </div>
      </div>
    </div>
  );
}
