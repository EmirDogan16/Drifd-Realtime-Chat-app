'use client';

import { useModalStore } from '@/hooks/use-modal-store';
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { Hash, Trash2, X } from 'lucide-react';

export function TextChannelSettingsModal() {
  const { isOpen, type, data, onClose } = useModalStore();
  const router = useRouter();
  const [channelName, setChannelName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isModalOpen = isOpen && type === 'textChannelSettings';

  useEffect(() => {
    if (isModalOpen && data.channelId) {
      console.log('🔍 Loading text channel settings for:', data.channelId);
      
      const loadChannelSettings = async () => {
        try {
          const supabase = createClient();
          
          const { data: channel, error } = await supabase
            .from('channels')
            .select('name')
            .eq('id', data.channelId)
            .single();

          console.log('📊 Text channel data loaded:', { channel, error });

          if (error) {
            console.error('❌ Text channel settings load error:', error);
            setChannelName(data.channelName || '');
            console.log('✅ Using name from props:', data.channelName);
            return;
          }

          if (channel) {
            setChannelName(channel.name || data.channelName || '');
            console.log('✅ Text channel settings loaded:', { name: channel.name });
          }
        } catch (err) {
          console.error('❌ Error loading text channel settings:', err);
          setChannelName(data.channelName || '');
          console.log('✅ Using fallback name from props:', data.channelName);
        }
      };

      loadChannelSettings();
      setShowDeleteConfirm(false);
    }
  }, [isModalOpen, data]);

  const handleClose = () => {
    setChannelName('');
    setError('');
    setSuccess('');
    setShowDeleteConfirm(false);
    onClose();
  };

  const handleSave = async () => {
    if (!channelName.trim()) {
      setError('Kanal adı boş bırakılamaz');
      return;
    }

    if (!data.channelId) {
      setError('Kanal ID bulunamadı');
      return;
    }

    console.log('🔄 Saving text channel settings:', {
      channelId: data.channelId,
      name: channelName.trim(),
    });

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const supabase = createClient();
      
      const { data: result, error: updateError } = await supabase
        .from('channels')
        .update({ name: channelName.trim() })
        .eq('id', data.channelId)
        .select();

      console.log('📊 Update result:', { result, error: updateError });

      if (updateError) {
        console.error('❌ Text channel update error:', updateError);
        throw updateError;
      }

      console.log('✅ Text channel settings saved successfully!');
      setSuccess('Kaydedildi!');
      
      setTimeout(() => {
        handleClose();
        router.refresh();
      }, 2000);
    } catch (err: any) {
      console.error('❌ Error updating text channel:', err);
      const errorMsg = err?.message || 'Kanal güncellenirken hata oluştu';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!data.channelId) {
      setError('Kanal ID bulunamadı');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const supabase = createClient();
      
      const { error } = await supabase
        .from('channels')
        .delete()
        .eq('id', data.channelId);

      if (error) throw error;

      // Redirect to server home
      router.push(`/servers/${data.serverId}`);
      router.refresh();
      handleClose();
    } catch (err: any) {
      console.error('Error deleting channel:', err);
      setError(err?.message || 'Kanal silinirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  if (!isModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-lg bg-drifd-tertiary shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-drifd-divider bg-drifd-secondary px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-drifd-tertiary p-2 text-drifd-muted">
              <Hash className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Kanal Ayarları</h2>
              <p className="text-xs text-drifd-muted">#{data.channelName}</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="rounded-full p-1.5 text-drifd-muted transition-all hover:bg-drifd-hover hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-6 p-6">
          {/* Channel Name */}
          <div>
            <label className="mb-2 block text-sm font-medium text-white">Kanal Adı</label>
            <div className="flex items-center gap-2 rounded-lg bg-[#1e1f22] px-4 py-3 transition-all focus-within:ring-2 focus-within:ring-drifd-primary/50">
              <div className="text-drifd-muted">
                <Hash className="h-5 w-5" />
              </div>
              <input
                type="text"
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                placeholder="Kanal adını gir..."
                className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-drifd-muted"
                disabled={loading}
              />
            </div>
          </div>

          {/* Error/Success Messages */}
          {error && (
            <div className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-lg bg-green-500/10 px-4 py-3 text-sm text-green-400">
              {success}
            </div>
          )}

          {/* Danger Zone */}
          <div className="space-y-3 rounded-lg border-2 border-red-500/20 bg-red-500/5 p-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-red-400">Tehlikeli Bölge</h3>
              <p className="text-xs text-drifd-muted">
                Bu kanalı silmek geri alınamaz bir işlemdir
              </p>
            </div>

            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Kanalı Sil
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-medium text-red-400">
                  Bu kanalı silmek istediğinizden emin misiniz?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleDelete}
                    disabled={loading}
                    className="flex-1 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Evet, Sil
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={loading}
                    className="flex-1 rounded-lg bg-[#1e1f22] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2b2d31] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    İptal
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer Buttons */}
          <div className="flex justify-end gap-3">
            <button
              onClick={handleClose}
              disabled={loading}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1e1f22] disabled:cursor-not-allowed disabled:opacity-50"
            >
              İptal
            </button>
            <button
              onClick={handleSave}
              disabled={loading || !channelName.trim()}
              className="rounded-lg bg-drifd-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-drifd-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
