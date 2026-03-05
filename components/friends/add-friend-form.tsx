'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function AddFriendForm() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username.trim()) {
      setMessage({ type: 'error', text: 'Kullanıcı adı gerekli' });
      return;
    }

    setIsLoading(true);
    setMessage(null);

    try {
      const response = await fetch('/api/friends/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: username.trim() }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Arkadaş eklenemedi');
      }

      setMessage({ type: 'success', text: 'Arkadaşlık isteği gönderildi!' });
      setUsername('');
      
      // Refresh the page to show updated friend requests
      setTimeout(() => {
        router.refresh();
      }, 1000);
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Bir hata oluştu' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-white font-semibold text-lg mb-2">Arkadaş Ekle</h3>
        <p className="text-sm text-drifd-muted">
          Arkadaşını Discord kullanıcı adı ile ekleyebilirsin.
        </p>
      </div>
      <div className="bg-drifd-secondary rounded-lg p-6 border border-drifd-divider">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              placeholder="Kullanıcı adını girerek arkadaş ekleyebilirsin"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isLoading}
              className="w-full px-4 py-3 bg-[#1e1f22] border border-[#1e1f22] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#6F58F2] disabled:opacity-50 transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading || !username.trim()}
            className="px-6 py-2 bg-[#6F58F2] hover:bg-[#5f4ad9] text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Gönderiliyor...' : 'Arkadaşlık İsteği Gönder'}
          </button>
        </form>
        {message && (
          <div className={`mt-4 p-3 rounded ${message.type === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
}
