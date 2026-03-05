'use client';

import { useState, useRef, useEffect } from 'react';
import { Plus, Edit2, Trash2, VolumeX } from 'lucide-react';
import { useModalStore } from '@/hooks/use-modal-store';

interface ChannelSectionHeaderProps {
  label: string;
  serverId: string;
  canManageChannels: boolean;
  categoryId?: string;
}

export function ChannelSectionHeader({ label, serverId, canManageChannels, categoryId }: ChannelSectionHeaderProps) {
  const { onOpen } = useModalStore();
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);

  // Check if this is a custom category (not default text/audio)
  const isCustomCategory = categoryId && !['category-text', 'category-audio'].includes(categoryId);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowContextMenu(false);
      }
    };

    if (showContextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showContextMenu]);

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!canManageChannels) return;
    
    e.preventDefault();
    e.stopPropagation();
    setMenuPosition({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  };

  const handleMuteCategory = () => {
    // TODO: Implement mute category
    console.log('Mute category:', categoryId);
    setShowContextMenu(false);
  };

  const handleEditCategory = () => {
    onOpen('editCategory', { serverId, categoryId, categoryName: label });
    setShowContextMenu(false);
  };

  const handleDeleteCategory = () => {
    onOpen('deleteCategory', { serverId, categoryId, categoryName: label });
    setShowContextMenu(false);
  };

  return (
    <>
      <div 
        className="flex items-center justify-between pl-5 pr-2 mb-1 group"
        onContextMenu={handleContextMenu}
      >
        <p className="text-xs font-bold uppercase tracking-wide text-drifd-muted cursor-default">
          {label}
        </p>
        {canManageChannels && (
          <button
            onClick={() => onOpen('createChannel', { serverId, categoryId })}
            className="text-drifd-muted hover:text-white transition-colors opacity-0 group-hover:opacity-100"
            title="Kanal Oluştur"
          >
            <Plus size={16} />
          </button>
        )}
      </div>

      {/* Context Menu */}
      {showContextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[200px] bg-[#111214] rounded-md shadow-lg border border-drifd-divider py-1"
          style={{
            left: `${menuPosition.x}px`,
            top: `${menuPosition.y}px`,
          }}
        >
          <button
            onClick={handleEditCategory}
            disabled={!isCustomCategory}
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
              isCustomCategory
                ? 'text-drifd-text hover:bg-drifd-accent hover:text-white cursor-pointer'
                : 'text-drifd-muted/50 cursor-not-allowed'
            }`}
          >
            <Edit2 size={16} />
            <span>Kategoriyi Düzenle</span>
          </button>
          <button
            onClick={handleMuteCategory}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-drifd-text hover:bg-drifd-accent hover:text-white transition-colors"
          >
            <VolumeX size={16} />
            <span>Kategoriyi Sustur</span>
          </button>
          <div className="h-px bg-drifd-divider my-1" />
          <button
            onClick={handleDeleteCategory}
            disabled={!isCustomCategory}
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
              isCustomCategory
                ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300 cursor-pointer'
                : 'text-red-400/30 cursor-not-allowed'
            }`}
          >
            <Trash2 size={16} />
            <span>Kategoriyi Sil</span>
          </button>
        </div>
      )}
    </>
  );
}
