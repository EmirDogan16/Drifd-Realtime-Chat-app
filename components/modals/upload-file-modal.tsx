'use client';

import { useState, useRef } from 'react';
import { X, Upload, File } from 'lucide-react';
import { useModalStore } from '@/hooks/use-modal-store';
import { createClient } from '@/utils/supabase/client';

export function UploadFileModal() {
  const { type, isOpen, onClose, data } = useModalStore();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isModalOpen = isOpen && type === 'uploadFile';

  const handleClose = () => {
    setSelectedFile(null);
    setMessage('');
    setUploading(false);
    onClose();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // 50MB limit
      if (file.size > 50 * 1024 * 1024) {
        alert('Dosya boyutu 50MB\'dan küçük olmalıdır.');
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (file.size > 50 * 1024 * 1024) {
        alert('Dosya boyutu 50MB\'dan küçük olmalıdır.');
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleSubmit = async () => {
    if (!selectedFile || !data.channelId || !data.memberId) return;

    setUploading(true);

    try {
      const supabase = createClient();
      
      // Generate unique file name
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
      const filePath = `uploads/${fileName}`;

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('files')
        .upload(filePath, selectedFile, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        alert('Dosya yüklenirken hata oluştu. Lütfen tekrar deneyin.');
        setUploading(false);
        return;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('files')
        .getPublicUrl(filePath);

      // Save message with file URL
      const { error: messageError } = await supabase
        .from('messages')
        .insert({
          content: message || selectedFile.name,
          fileurl: publicUrl,
          memberid: data.memberId,
          channelid: data.channelId,
        });

      if (messageError) {
        console.error('Message error:', messageError);
        alert('Mesaj gönderilirken hata oluştu.');
        setUploading(false);
        return;
      }

      // Success
      setUploading(false);
      handleClose();
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Bir hata oluştu. Lütfen tekrar deneyin.');
      setUploading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  if (!isModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative w-full max-w-md rounded-lg bg-[#313338] shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4">
          <h2 className="text-xl font-bold text-white">Bir Dosya yükle</h2>
          <button
            onClick={handleClose}
            className="rounded text-[#b5bac1] transition-colors hover:text-white"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 pt-0">
          {/* File Drop Zone */}
          {!selectedFile ? (
            <div
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="mb-4 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-[#4e5058] bg-[#2b2d31] py-12 transition-colors hover:border-[#5865f2] hover:bg-[#1e1f22]"
            >
              <Upload className="mb-3 h-12 w-12 text-[#b5bac1]" />
              <p className="mb-1 text-sm font-semibold text-white">Dosya seçmek için tıklayın veya sürükleyip bırakın</p>
              <p className="text-xs text-[#b5bac1]">Maksimum 50 MB - Tüm dosya türleri desteklenir</p>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          ) : (
            <div className="mb-4 rounded-lg bg-[#2b2d31] p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded bg-[#5865f2]">
                  <File className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{selectedFile.name}</p>
                  <p className="text-xs text-[#b5bac1]">{formatFileSize(selectedFile.size)}</p>
                </div>
                <button
                  onClick={() => setSelectedFile(null)}
                  className="flex-shrink-0 text-[#b5bac1] transition-colors hover:text-red-400"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
          )}

          {/* Message Input */}
          <div className="mb-4">
            <label className="mb-2 block text-xs font-semibold uppercase text-[#b5bac1]">
              Mesaj ekle (opsiyonel)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Dosya hakkında bir şeyler yaz..."
              maxLength={500}
              rows={3}
              className="w-full resize-none rounded bg-[#1e1f22] px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-[#5865f2]"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-[#3f4147] p-4">
          <button
            onClick={handleClose}
            disabled={uploading}
            className="rounded px-4 py-2 text-sm font-medium text-white transition-colors hover:underline disabled:opacity-50"
          >
            İptal
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selectedFile || uploading}
            className="rounded bg-[#5865f2] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? 'Yükleniyor...' : 'Yükle'}
          </button>
        </div>
      </div>
    </div>
  );
}
