'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Users, CheckCircle, X } from 'lucide-react';

interface InviteAcceptClientProps {
  serverId: string;
  serverName: string;
  serverImage: string | null;
  memberCount: number;
  inviteCode: string;
}

export function InviteAcceptClient({
  serverId,
  serverName,
  serverImage,
  memberCount: initialMemberCount,
  inviteCode,
}: InviteAcceptClientProps) {
  const router = useRouter();
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');
  const [memberCount, setMemberCount] = useState(initialMemberCount);

  // Fetch actual member count from API
  useEffect(() => {
    const fetchMemberCount = async () => {
      try {
        const response = await fetch(`/api/servers/member-count?inviteCode=${inviteCode}`);
        if (response.ok) {
          const data = await response.json();
          setMemberCount(data.memberCount || 1);
        }
      } catch (err) {
        console.error('Failed to fetch member count:', err);
      }
    };

    fetchMemberCount();
  }, [inviteCode]);

  const handleJoin = async () => {
    setIsJoining(true);
    setError('');

    try {
      const response = await fetch('/api/servers/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode }),
      });

      if (!response.ok) {
        const data = await response.json();
        console.error('Join server error:', data);
        throw new Error(data.error || 'Sunucuya katılınamadı');
      }

      const data = await response.json();
      // Success! Redirect to server
      router.push(`/servers/${data.serverId}`);
    } catch (err: any) {
      console.error('Failed to join server:', err);
      setError(err.message);
      setIsJoining(false);
    }
  };

  const handleClose = () => {
    router.push('/');
  };

  // Display member count properly (minimum 1 since owner exists)
  const displayMemberCount = Math.max(memberCount, 1);
  const onlineCount = Math.max(Math.floor(displayMemberCount * 0.7), 1); // Estimate ~70% online

  return (
    <div className="flex min-h-screen items-center justify-center bg-drifd-bg p-4">
      <div className="max-w-md w-full">
        <div className="bg-drifd-secondary rounded-lg shadow-xl overflow-hidden relative">
          {/* Close Button */}
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 z-10 p-2 rounded-full hover:bg-drifd-hover transition-colors"
            title="Kapat"
          >
            <X size={24} className="text-drifd-text" />
          </button>

          {/* Content */}
          <div className="p-8 text-center">
            {/* Server Icon */}
            <div className="mb-4 flex justify-center">
              <div className="w-20 h-20 rounded-full bg-drifd-hover flex items-center justify-center text-3xl font-bold text-white border-4 border-drifd-secondary shadow-lg">
                {serverImage ? (
                  <img
                    src={serverImage}
                    alt={serverName}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  serverName.charAt(0).toUpperCase()
                )}
              </div>
            </div>

            {/* Server Name */}
            <h1 className="text-2xl font-bold text-white mb-2">
              {serverName} sunucusuna davet edildiniz
            </h1>

            {/* Member Count */}
            <div className="flex items-center justify-center gap-3 text-sm mb-6">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span className="text-drifd-text">
                  <span className="font-semibold text-white">{onlineCount}</span> Çevrimiçi
                </span>
              </div>
              <span className="text-drifd-divider">•</span>
              <div className="flex items-center gap-1.5">
                <Users size={14} className="text-drifd-muted" />
                <span className="text-drifd-text">
                  <span className="font-semibold text-white">{displayMemberCount}</span> Üye
                </span>
              </div>
            </div>

            {/* Features/Info */}
            <div className="bg-drifd-hover rounded-md p-4 mb-6 space-y-2">
              <div className="flex items-center gap-2 text-sm text-drifd-text">
                <CheckCircle size={16} className="text-green-400" />
                <span>Metin ve sesli kanallar</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-drifd-text">
                <CheckCircle size={16} className="text-green-400" />
                <span>Aktif topluluk</span>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/50 rounded-md p-3 text-red-400 text-sm mb-4">
                {error}
              </div>
            )}

            {/* Join Button */}
            <button
              onClick={handleJoin}
              disabled={isJoining}
              className="w-full px-6 py-3 bg-drifd-primary hover:bg-drifd-primary/80 disabled:bg-drifd-primary/50 text-white rounded-md font-semibold transition-colors disabled:cursor-not-allowed"
            >
              {isJoining ? 'Katılınıyor...' : `${serverName} Sunucusuna Katıl`}
            </button>

            {/* Info Text */}
            <p className="text-xs text-drifd-muted mt-4">
              Kabul ederek {serverName} topluluğuna katılmayı kabul etmiş olursunuz
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
