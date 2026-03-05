'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Hash, Volume2, Lock } from 'lucide-react';
import { useModalStore } from '@/hooks/use-modal-store';

type ChannelType = 'TEXT' | 'AUDIO';

export function CreateChannelModal() {
  const router = useRouter();
  const { isOpen, type, onClose, data } = useModalStore();
  const [channelType, setChannelType] = useState<ChannelType>('TEXT');
  const [channelName, setChannelName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const isModalOpen = isOpen && type === 'createChannel';
  const { serverId, categoryId } = data;

  const handleClose = () => {
    setChannelName('');
    setChannelType('TEXT');
    setIsPrivate(false);
    setError('');
    onClose();
  };

  const handleCreate = async () => {
    if (!channelName.trim()) {
      setError('Kanal adı gerekli');
      return;
    }

    if (!serverId) {
      setError('Sunucu bulunamadı');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/channels/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverId,
          name: channelName.trim(),
          type: channelType,
          isPrivate,
          categoryid: categoryId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Kanal oluşturulamadı');
      }

      const channel = await response.json();
      
      handleClose();
      
      // Emit event to refresh sidebar
      window.dispatchEvent(new Event('channelCreated'));
      
      // Navigate to the new channel
      router.push(`/servers/${serverId}/channels/${channel.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-[#36393F] rounded-lg shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#26282C]">
          <h2 className="text-xl font-bold text-white">Kanal Oluştur</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Channel Type */}
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
              Kanal Türü
            </label>
            <div className="space-y-2">
              {/* Text Channel */}
              <button
                onClick={() => setChannelType('TEXT')}
                disabled={isLoading}
                className={`w-full p-3 rounded-md border transition-colors flex items-center gap-3 ${
                  channelType === 'TEXT'
                    ? 'bg-[#404249] border-[#6F58F2] text-white'
                    : 'bg-[#2B2D31] border-[#1E1F22] text-gray-400 hover:border-gray-600'
                }`}
              >
                <div className={`flex-shrink-0 ${channelType === 'TEXT' ? 'text-[#6F58F2]' : 'text-gray-400'}`}>
                  <Hash size={24} />
                </div>
                <div className="flex-1 text-left">
                  <div className="font-semibold">Metin</div>
                  <div className="text-xs text-gray-400">
                    Mesajlar, resimler, GIF'ler, emojiler, fikirler ve şakalar gönder
                  </div>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  channelType === 'TEXT' 
                    ? 'border-[#6F58F2]' 
                    : 'border-gray-600'
                }`}>
                  {channelType === 'TEXT' && (
                    <div className="w-3 h-3 rounded-full bg-[#6F58F2]" />
                  )}
                </div>
              </button>

              {/* Voice Channel */}
              <button
                onClick={() => setChannelType('AUDIO')}
                disabled={isLoading}
                className={`w-full p-3 rounded-md border transition-colors flex items-center gap-3 ${
                  channelType === 'AUDIO'
                    ? 'bg-[#404249] border-[#6F58F2] text-white'
                    : 'bg-[#2B2D31] border-[#1E1F22] text-gray-400 hover:border-gray-600'
                }`}
              >
                <div className={`flex-shrink-0 ${channelType === 'AUDIO' ? 'text-[#6F58F2]' : 'text-gray-400'}`}>
                  <Volume2 size={24} />
                </div>
                <div className="flex-1 text-left">
                  <div className="font-semibold">Ses</div>
                  <div className="text-xs text-gray-400">
                    Birlikte sesli veya görüntülü konuşun veya ekran paylaş
                  </div>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  channelType === 'AUDIO' 
                    ? 'border-[#6F58F2]' 
                    : 'border-gray-600'
                }`}>
                  {channelType === 'AUDIO' && (
                    <div className="w-3 h-3 rounded-full bg-[#6F58F2]" />
                  )}
                </div>
              </button>
            </div>
          </div>

          {/* Channel Name */}
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
              Kanal Adı
            </label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                {channelType === 'TEXT' ? <Hash size={20} /> : <Volume2 size={20} />}
              </div>
              <input
                type="text"
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                placeholder="yeni-kanal"
                disabled={isLoading}
                className="w-full bg-[#1E1F22] border border-[#26282C] rounded-md pl-10 pr-3 py-2 text-white placeholder:text-gray-500 focus:outline-none focus:border-[#6F58F2] disabled:opacity-50"
              />
            </div>
          </div>

          {/* Private Channel Toggle */}
          <div className="flex items-start gap-3 bg-[#2B2D31] rounded-md p-3">
            <button
              onClick={() => setIsPrivate(!isPrivate)}
              disabled={isLoading}
              className={`flex-shrink-0 w-10 h-6 rounded-full transition-colors relative ${
                isPrivate ? 'bg-[#6F58F2]' : 'bg-gray-600'
              }`}
            >
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                isPrivate ? 'translate-x-5' : 'translate-x-1'
              }`} />
            </button>
            <div className="flex-1">
              <div className="flex items-center gap-2 font-semibold text-white mb-1">
                <Lock size={16} />
                <span>Özel Kanal</span>
              </div>
              <div className="text-xs text-gray-400">
                Sadece seçilen üyeler ve roller bu kanalı görüntüleyebilir
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 rounded-md p-3 text-red-400 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 bg-[#2B2D31]">
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="px-4 py-2 text-white hover:underline transition-all disabled:opacity-50"
          >
            İptal
          </button>
          <button
            onClick={handleCreate}
            disabled={isLoading || !channelName.trim()}
            className="px-4 py-2 bg-[#6F58F2] hover:bg-[#5f4ad9] text-white rounded-md font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Oluşturuluyor...' : 'Kanal Oluştur'}
          </button>
        </div>
      </div>
    </div>
  );
}
