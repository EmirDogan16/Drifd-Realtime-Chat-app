'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface FriendRequest {
  id: string;
  requester_id: string;
  requester: {
    id: string;
    username: string;
    imageurl: string | null;
  };
}

interface FriendRequestListProps {
  requests: FriendRequest[];
}

function getInitials(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const [first, second] = trimmed.split(/\s+/).filter(Boolean).slice(0, 2);
  return `${first?.[0] ?? ''}${second?.[0] ?? ''}`.toUpperCase() || trimmed[0]?.toUpperCase() || '?';
}

export function FriendRequestList({ requests }: FriendRequestListProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  const handleAccept = async (requestId: string) => {
    setLoading({ ...loading, [requestId]: true });
    try {
      const response = await fetch('/api/friends/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ friendshipId: requestId }),
      });

      if (response.ok) {
        router.refresh();
      }
    } catch (error) {
      console.error('Error accepting friend request:', error);
    } finally {
      setLoading({ ...loading, [requestId]: false });
    }
  };

  const handleReject = async (requestId: string) => {
    setLoading({ ...loading, [requestId]: true });
    try {
      const response = await fetch('/api/friends/reject', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ friendshipId: requestId }),
      });

      if (response.ok) {
        router.refresh();
      }
    } catch (error) {
      console.error('Error rejecting friend request:', error);
    } finally {
      setLoading({ ...loading, [requestId]: false });
    }
  };

  if (requests.length === 0) {
    return null;
  }

  return (
    <div className="border-t border-drifd-divider">
      {requests.map((request) => (
        <div
          key={request.id}
          className="flex items-center justify-between px-2 py-3 border-b border-drifd-divider hover:bg-drifd-hover/30 rounded group"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-drifd-hover flex items-center justify-center overflow-hidden flex-shrink-0">
              {request.requester.imageurl ? (
                <img
                  src={request.requester.imageurl}
                  alt={request.requester.username}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-xs font-bold text-white">
                  {getInitials(request.requester.username)}
                </span>
              )}
            </div>
            <div>
              <div className="text-white font-medium">{request.requester.username}</div>
              <div className="text-xs text-drifd-muted">Gelen Arkadaşlık İsteği</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleAccept(request.id)}
              disabled={loading[request.id]}
              className="p-2 bg-drifd-secondary hover:bg-drifd-hover rounded-full disabled:opacity-50"
              title="Kabul Et"
            >
              <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </button>
            <button
              onClick={() => handleReject(request.id)}
              disabled={loading[request.id]}
              className="p-2 bg-drifd-secondary hover:bg-drifd-hover rounded-full disabled:opacity-50"
              title="Reddet"
            >
              <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
