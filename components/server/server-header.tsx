'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Settings, UserPlus, Link, Bell, BellOff, LogOut, Trash2, FolderPlus } from 'lucide-react';
import { useModalStore } from '@/hooks/use-modal-store';
import { useNotificationPreferences } from '@/hooks/use-notification-preferences';

interface ServerHeaderProps {
  serverName: string;
  serverId: string;
  inviteCode: string;
  isOwner?: boolean;
  isAdmin?: boolean;
}

export function ServerHeader({ serverName, serverId, inviteCode, isOwner = false, isAdmin = false }: ServerHeaderProps) {
  const { onOpen } = useModalStore();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { isServerMuted: isMuted, toggleServerMute } = useNotificationPreferences(serverId);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isDropdownOpen]);

  const handleServerSettings = () => {
    onOpen('serverSettings', { serverId, serverName });
    setIsDropdownOpen(false);
  };

  const handleMuteToggle = () => {
    void toggleServerMute();
    setIsDropdownOpen(false);
  };

  const handleInvite = () => {
    onOpen('inviteMembers', { serverName, inviteCode });
    setIsDropdownOpen(false);
  };

  const handleCreateCategory = () => {
    onOpen('createCategory', { serverId });
    setIsDropdownOpen(false);
  };

  const handleLeaveServer = async () => {
    if (confirm(`"${serverName}" sunucusundan ayrılmak istediğine emin misin?`)) {
      setIsLeaving(true);
      try {
        const response = await fetch('/api/servers/leave', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serverId }),
        });

        const data = await response.json();

        if (!response.ok) {
          alert(data.error || 'Sunucudan ayrılırken bir hata oluştu');
          return;
        }

        // Redirect to home page
        window.location.href = '/';
      } catch (error) {
        console.error('[Leave Server] Error:', error);
        alert('Sunucudan ayrılırken bir hata oluştu');
      } finally {
        setIsLeaving(false);
      }
    }
    setIsDropdownOpen(false);
  };

  const handleDeleteServer = async () => {
    if (confirm(`"${serverName}" sunucusunu kalıcı olarak silmek istediğine emin misin? Bu işlem geri alınamaz!`)) {
      setIsDeleting(true);
      try {
        const response = await fetch('/api/servers/delete', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serverId }),
        });

        const data = await response.json();

        if (!response.ok) {
          alert(data.error || 'Sunucu silinirken bir hata oluştu');
          return;
        }

        // Redirect to home page
        window.location.href = '/';
      } catch (error) {
        console.error('[Delete Server] Error:', error);
        alert('Sunucu silinirken bir hata oluştu');
      } finally {
        setIsDeleting(false);
      }
    }
    setIsDropdownOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        className="flex h-12 w-full items-center justify-between border-b border-drifd-divider px-4 text-sm font-bold text-white hover:bg-drifd-hover transition-colors"
      >
        <span>{serverName}</span>
        <ChevronDown 
          size={18} 
          className={`text-white transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown Menu */}
      {isDropdownOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 mx-2 bg-drifd-tertiary border border-drifd-divider rounded-md shadow-lg z-30 py-1">
          {/* Invite People */}
          <button
            onClick={handleInvite}
            className="w-full px-3 py-2 hover:bg-drifd-hover flex items-center gap-3 text-sm text-[#6F58F2] transition-colors"
          >
            <UserPlus size={16} />
            <span>Kişileri Davet Et</span>
          </button>

          <div className="h-px bg-drifd-divider my-1" />

          {/* Server Settings (Admin/Owner only) */}
          {(isAdmin || isOwner) && (
            <button
              onClick={handleServerSettings}
              className="w-full px-3 py-2 hover:bg-drifd-secondary flex items-center gap-3 text-sm text-white transition-colors"
            >
              <Settings size={16} className="text-drifd-muted" />
              <span>Sunucu Ayarları</span>
            </button>
          )}

          {/* Create Category (Admin/Owner only) */}
          {(isAdmin || isOwner) && (
            <button
              onClick={handleCreateCategory}
              className="w-full px-3 py-2 hover:bg-drifd-secondary flex items-center gap-3 text-sm text-white transition-colors"
            >
              <FolderPlus size={16} className="text-drifd-muted" />
              <span>Kategori Oluştur</span>
            </button>
          )}

          {/* Mute/Unmute Server */}
          <button
            onClick={handleMuteToggle}
            className="w-full px-3 py-2 hover:bg-drifd-secondary flex items-center gap-3 text-sm text-white transition-colors"
          >
            {isMuted ? (
              <>
                <Bell size={16} className="text-green-400" />
                <span>Bildirimleri Aç</span>
              </>
            ) : (
              <>
                <BellOff size={16} className="text-gray-400" />
                <span>Bildirimleri Kapat</span>
              </>
            )}
          </button>

          <div className="h-px bg-drifd-divider my-1" />

          {/* Delete Server (Owner only) */}
          {isOwner ? (
            <button
              onClick={handleDeleteServer}
              disabled={isDeleting}
              className="w-full px-3 py-2 hover:bg-red-600/20 flex items-center gap-3 text-sm text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 size={16} />
              <span>{isDeleting ? 'Siliniyor...' : 'Sunucuyu Sil'}</span>
            </button>
          ) : (
            /* Leave Server (Non-owner) */
            <button
              onClick={handleLeaveServer}
              disabled={isLeaving}
              className="w-full px-3 py-2 hover:bg-red-600/20 flex items-center gap-3 text-sm text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <LogOut size={16} />
              <span>{isLeaving ? 'Ayrılınıyor...' : 'Sunucudan Ayrıl'}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
