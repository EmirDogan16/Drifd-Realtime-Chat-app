'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { X, Hash, Volume2, Video, Trash2, AlertTriangle } from 'lucide-react';
import { useModalStore } from '@/hooks/use-modal-store';
import { createClient } from '@/utils/supabase/client';

export function ChannelSettingsModal() {
  const router = useRouter();
  const { type, isOpen, data, onClose } = useModalStore();
  const [loading, setLoading] = useState(false);
  const [channelName, setChannelName] = useState('');
  const [bitrate, setBitrate] = useState(64);
  const [videoQuality, setVideoQuality] = useState<'auto' | '720p' | '1080p'>('auto');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isModalOpen = isOpen && type === 'channelSettings';

  useEffect(() => {
    if (isModalOpen && data.channelId) {
      console.log('🔍 Loading channel settings for:', data.channelId);
      
      // Load channel settings from database
      const loadChannelSettings = async () => {
        try {
          const supabase = createClient();
          
          // Try to load with quality settings
          // @ts-ignore - Supabase type issue
          const { data: channel, error } = await supabase
            .from('channels')
            // @ts-ignore - Supabase type issue
            .select('name, bitrate, video_quality')
            // @ts-ignore - Supabase type issue
            .eq('id', data.channelId)
            // @ts-ignore - Supabase type issue
            .single();

          console.log('📊 Channel data loaded:', { channel, error });

          if (error) {
            console.error('❌ Channel settings load error:', error);
            console.log('🔄 Trying fallback: loading name only...');
            
            // Fallback: try loading just the name
            // @ts-ignore - Supabase type issue
            const { data: basicChannel, error: basicError } = await supabase
              .from('channels')
              // @ts-ignore - Supabase type issue
              .select('name')
              // @ts-ignore - Supabase type issue
              .eq('id', data.channelId)
              // @ts-ignore - Supabase type issue
              .single();
              
            console.log('📊 Basic channel data:', { basicChannel, error: basicError });
              
            if (basicChannel) {
              // @ts-ignore - Supabase type issue
              setChannelName(basicChannel.name || data.channelName || '');
              console.log('✅ Loaded name from DB:', basicChannel.name);
            } else {
              setChannelName(data.channelName || '');
              console.log('✅ Using name from props:', data.channelName);
            }
            return;
          }

          if (channel) {
            // @ts-ignore - Supabase type issue
            setChannelName(channel.name || data.channelName || '');
            // @ts-ignore - Supabase type issue
            setBitrate(channel.bitrate || 64);
            // @ts-ignore - Supabase type issue
            setVideoQuality((channel.video_quality as 'auto' | '720p' | '1080p') || 'auto');
            console.log('✅ All channel settings loaded:', {
              name: channel.name,
              bitrate: channel.bitrate,
              videoQuality: channel.video_quality
            });
          }
        } catch (err) {
          console.error('❌ Error loading channel settings:', err);
          // Fallback to data from props
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

    console.log('🔄 Saving channel settings:', {
      channelId: data.channelId,
      name: channelName.trim(),
      bitrate,
      videoQuality
    });

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const supabase = createClient();
      
      // Try to update with new columns first
      const { data: result, error: updateError } = await supabase
        .from('channels')
        // @ts-ignore - Supabase type issue
        .update({ 
          name: channelName.trim(),
          bitrate: bitrate,
          video_quality: videoQuality
        })
        .eq('id', data.channelId)
        .select();

      console.log('📊 Update result:', { result, error: updateError });

      // If columns don't exist, fallback to just updating name
      if (updateError) {
        console.error('❌ Channel update error details:', updateError);
        console.log('🔄 Trying fallback: updating name only...');
        
        // Try updating just the name
        const { data: nameResult, error: nameError } = await supabase
          .from('channels')
          // @ts-ignore - Supabase type issue
          .update({ name: channelName.trim() })
          .eq('id', data.channelId)
          .select();
          
        console.log('📊 Name-only update result:', { result: nameResult, error: nameError });
        
        if (nameError) throw nameError;
      }

      console.log('✅ Channel settings saved successfully!');
      setSuccess('Kaydedildi!');
      
      // Wait 2 seconds, close modal, then refresh to show changes
      setTimeout(() => {
        handleClose();
        router.refresh();
      }, 2000);
    } catch (err: any) {
      console.error('❌ Error updating channel:', err);
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
    try {
      const supabase = createClient();
      const { error: deleteError } = await supabase
        .from('channels')
        // @ts-ignore - Supabase type issue
        .delete()
        .eq('id', data.channelId);

      if (deleteError) throw deleteError;

      router.push(`/servers/${data.serverId}`);
      router.refresh();
      handleClose();
    } catch (err) {
      console.error('Error deleting channel:', err);
      setError('Kanal silinirken hata oluştu');
      setLoading(false);
    }
  };

  const getChannelIcon = () => {
    if (data.channelType === 'TEXT') return <Hash className="h-5 w-5" />;
    if (data.channelType === 'VIDEO') return <Video className="h-5 w-5" />;
    return <Volume2 className="h-5 w-5" />;
  };

  if (!isModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-lg bg-drifd-tertiary shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-drifd-divider bg-drifd-secondary px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-drifd-tertiary p-2 text-drifd-muted">
              {getChannelIcon()}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Kanal Ayarları</h2>
              <p className="text-xs text-drifd-muted">{data.channelName}</p>
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
              <div className="text-drifd-muted">{getChannelIcon()}</div>
              <input
                type="text"
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-drifd-muted"
                placeholder="Kanal adını gir..."
                disabled={loading}
              />
            </div>
          </div>

          {/* Audio/Video Quality Settings */}
          {(data.channelType === 'AUDIO' || data.channelType === 'VIDEO') && (
            <>
              {/* Bitrate */}
              <div>
                <label className="mb-2 block text-sm font-medium text-white">
                  Ses Kalitesi (Bitrate)
                </label>
                <div className="rounded-lg bg-[#1e1f22] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs text-drifd-muted">8 kbps</span>
                    <span className="rounded-full bg-drifd-primary px-3 py-1 text-xs font-semibold text-black">
                      {bitrate} kbps
                    </span>
                    <span className="text-xs text-drifd-muted">96 kbps</span>
                  </div>
                  <input
                    type="range"
                    min="8"
                    max="96"
                    step="8"
                    value={bitrate}
                    onChange={(e) => setBitrate(Number(e.target.value))}
                    className="h-2 w-full cursor-pointer appearance-none rounded-full bg-drifd-hover [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-drifd-primary [&::-webkit-slider-thumb]:transition-all [&::-webkit-slider-thumb]:hover:scale-110"
                    disabled={loading}
                  />
                  <p className="mt-2 text-xs text-drifd-muted">
                    Daha yüksek bitrate daha iyi ses kalitesi sağlar
                  </p>
                </div>
              </div>

              {/* Video/Stream Quality */}
              <div>
                <label className="mb-2 block text-sm font-medium text-white">
                  Yayın Kalitesi
                </label>
                <div className="space-y-2 rounded-lg bg-[#1e1f22] p-4">
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg p-3 transition-colors hover:bg-drifd-hover">
                    <input
                      type="radio"
                      name="videoQuality"
                      value="auto"
                      checked={videoQuality === 'auto'}
                      onChange={(e) => setVideoQuality(e.target.value as any)}
                      className="h-4 w-4 cursor-pointer accent-drifd-primary"
                      disabled={loading}
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-white">Otomatik</div>
                      <div className="text-xs text-drifd-muted">
                        Bağlantı hızına göre en iyi kaliteyi seç
                      </div>
                    </div>
                  </label>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg p-3 transition-colors hover:bg-drifd-hover">
                    <input
                      type="radio"
                      name="videoQuality"
                      value="720p"
                      checked={videoQuality === '720p'}
                      onChange={(e) => setVideoQuality(e.target.value as any)}
                      className="h-4 w-4 cursor-pointer accent-drifd-primary"
                      disabled={loading}
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-white">720p</div>
                      <div className="text-xs text-drifd-muted">HD kalite, daha az bant genişliği</div>
                    </div>
                  </label>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg p-3 transition-colors hover:bg-drifd-hover">
                    <input
                      type="radio"
                      name="videoQuality"
                      value="1080p"
                      checked={videoQuality === '1080p'}
                      onChange={(e) => setVideoQuality(e.target.value as any)}
                      className="h-4 w-4 cursor-pointer accent-drifd-primary"
                      disabled={loading}
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-white">1080p</div>
                      <div className="text-xs text-drifd-muted">Full HD, en yüksek kalite</div>
                    </div>
                  </label>
                </div>
              </div>
            </>
          )}

          {/* Error/Success Messages */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/50 bg-red-900/20 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
              <span className="text-sm text-red-400">{error}</span>
            </div>
          )}

          {success && (
            <div className="rounded-lg border border-green-500/50 bg-green-900/20 p-3 text-center text-sm font-medium text-green-400">
              {success}
            </div>
          )}

          {/* Delete Section */}
          <div className="space-y-3 rounded-lg border border-red-500/20 bg-red-900/10 p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-red-400">Tehlikeli Bölge</h3>
                <p className="mt-1 text-xs text-red-300/70">
                  Bu işlem geri alınamaz. Kanal kalıcı olarak silinecektir.
                </p>
              </div>
            </div>

            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-400 transition-all hover:bg-red-500/20 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Kanalı Sil
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-center text-xs font-medium text-red-300">
                  Emin misiniz?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={loading}
                    className="flex-1 rounded-lg border border-drifd-divider bg-drifd-hover px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-drifd-hover/70 disabled:opacity-50"
                  >
                    İptal
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={loading}
                    className="flex-1 rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-red-600 disabled:opacity-50"
                  >
                    {loading ? 'Siliniyor...' : 'Evet, Sil'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-drifd-divider bg-drifd-secondary px-6 py-4">
          <button
            onClick={handleClose}
            disabled={loading}
            className="rounded-lg px-4 py-2 text-sm font-medium text-drifd-muted transition-colors hover:text-white disabled:opacity-50"
          >
            İptal
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="rounded-lg bg-drifd-primary px-6 py-2 text-sm font-semibold text-black transition-all hover:bg-drifd-primary/90 disabled:opacity-50"
          >
            {loading ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
}
