'use client';

import { useState, useEffect } from 'react';
import { X, Copy, Check, UserPlus } from 'lucide-react';
import { useModalStore } from '@/hooks/use-modal-store';

export function InviteMembersModal() {
  const { isOpen, type, onClose, data } = useModalStore();
  const [copied, setCopied] = useState(false);
  const [inviteUrl, setInviteUrl] = useState('');

  const isModalOpen = isOpen && type === 'inviteMembers';
  const { serverName, inviteCode } = data;

  // Set invite URL on client side only
  useEffect(() => {
    if (inviteCode && typeof window !== 'undefined') {
      setInviteUrl(`${window.location.origin}/invite/${inviteCode}`);
    }
  }, [inviteCode]);

  const handleClose = () => {
    setCopied(false);
    onClose();
  };

  const handleCopy = () => {
    if (inviteUrl) {
      navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
      <div className="relative w-full max-w-md bg-drifd-secondary rounded-lg shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-drifd-divider">
          <div>
            <h2 className="text-xl font-bold text-white">Arkadaşlarını Davet Et</h2>
            <p className="text-sm text-drifd-muted">
              Alıcılar <span className="text-white font-medium">#{serverName}</span> kanalına gelecek
            </p>
          </div>
          <button
            onClick={handleClose}
            className="text-drifd-muted hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Invite Link Section */}
          <div>
            <label className="block text-xs font-bold text-drifd-muted uppercase mb-2">
              Veya bir arkadaşına sunucu davetli bağlantısı yolla
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={inviteUrl}
                readOnly
                className="flex-1 bg-drifd-secondary border border-drifd-divider rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-[#6F58F2]"
              />
              <button
                onClick={handleCopy}
                className="px-4 py-2 bg-[#6F58F2] hover:bg-[#5f4ad9] text-white rounded-md font-semibold transition-colors flex items-center gap-2"
              >
                {copied ? (
                  <>
                    <Check size={16} />
                    Kopyalandı
                  </>
                ) : (
                  <>
                    <Copy size={16} />
                    Kopyala
                  </>
                )}
              </button>
            </div>
            <p className="text-xs text-drifd-muted mt-2">
              Davet bağlantısı süresi dolmayacak
            </p>
          </div>

          {/* Info Box */}
          <div className="bg-[#6F58F2]/10 border border-[#6F58F2]/30 rounded-md p-3 flex items-start gap-3">
            <UserPlus className="text-[#6F58F2] flex-shrink-0 mt-0.5" size={20} />
            <div className="text-sm text-[#9D8FF5]">
              Bu bağlantıya sahip olan herkes <span className="font-semibold text-white">{serverName}</span> sunucusuna katılabilir
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 bg-drifd-tertiary rounded-b-lg">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-white hover:underline transition-all"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
