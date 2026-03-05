'use client';

import { useModalStore } from '@/hooks/use-modal-store';
import { X } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';

interface VoterProfile {
  id: string;
  username: string;
  imageurl?: string;
}

export function PollVotersModal() {
  const { type, data, isOpen, onClose } = useModalStore();
  const [voters, setVoters] = useState<Record<string, VoterProfile[]>>({});
  const [loading, setLoading] = useState(true);
  const [pollData, setPollData] = useState(data.pollData);
  const isInitialLoadRef = useRef(true);

  const isModalOpen = isOpen && type === 'pollVoters';

  // Reset initial load flag when modal opens
  useEffect(() => {
    if (isModalOpen) {
      isInitialLoadRef.current = true;
      setLoading(true);
    }
  }, [isModalOpen]);

  // Heartbeat: Update poll data every 2 seconds
  useEffect(() => {
    if (!isModalOpen || !data.messageId) return;

    const supabase = createClient();

    const fetchPollData = async () => {
      const { data: message, error } = await supabase
        .from('messages')
        .select('poll_data')
        .eq('id', data.messageId)
        .single();

      if (message && message.poll_data && !error) {
        setPollData(message.poll_data);
      }
    };

    // Initial fetch
    fetchPollData();

    // Update every 2 seconds
    const interval = setInterval(fetchPollData, 2000);

    return () => clearInterval(interval);
  }, [isModalOpen, data.messageId]);

  useEffect(() => {
    if (!isModalOpen || !pollData) return;

    const fetchVoters = async () => {
      const supabase = createClient();
      const votedUsers = pollData.voted_users || {};
      
      // Get all unique user IDs
      const allUserIds = Object.keys(votedUsers);
      
      if (allUserIds.length === 0) {
        if (isInitialLoadRef.current) {
          setLoading(false);
          isInitialLoadRef.current = false;
        }
        return;
      }

      // Fetch all profiles
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, username, imageurl')
        .in('id', allUserIds);

      if (error || !profiles) {
        console.error('Error fetching voters:', error);
        if (isInitialLoadRef.current) {
          setLoading(false);
          isInitialLoadRef.current = false;
        }
        return;
      }

      // Group voters by option
      const votersByOption: Record<string, VoterProfile[]> = {};
      
      pollData.options.forEach((option: any) => {
        votersByOption[option.id] = [];
      });

      // For each user, add them to their voted options
      Object.entries(votedUsers).forEach(([userId, optionIds]) => {
        const profile = profiles.find(p => p.id === userId);
        if (!profile) return;

        (optionIds as string[]).forEach((optionId: string) => {
          if (votersByOption[optionId]) {
            votersByOption[optionId].push(profile);
          }
        });
      });

      setVoters(votersByOption);
      
      // Only set loading false on initial load
      if (isInitialLoadRef.current) {
        setLoading(false);
        isInitialLoadRef.current = false;
      }
    };

    fetchVoters();
  }, [isModalOpen, pollData]);

  if (!isModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-[#313338] shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#3f4147] p-4">
          <div>
            <h3 className="text-lg font-semibold text-white">
              {data.pollQuestion || 'Anket'}
            </h3>
            <p className="text-sm text-gray-400">
              {Object.keys(pollData?.voted_users || {}).length} kişi oy verdi
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 hover:bg-[#3f4147]"
          >
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[500px] overflow-y-auto p-4">
          {loading ? (
            <div className="py-8 text-center text-gray-400">
              Yükleniyor...
            </div>
          ) : (
            <div className="space-y-4">
              {pollData?.options.map((option: any) => {
                const optionVoters = voters[option.id] || [];
                
                return (
                  <div key={option.id}>
                    <div className="mb-2 text-sm font-medium text-gray-300">
                      {option.text}
                      <span className="ml-2 text-gray-500">
                        ({optionVoters.length})
                      </span>
                    </div>
                    
                    {optionVoters.length === 0 ? (
                      <div className="py-2 text-sm text-gray-500">
                        Henüz oy yok
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {optionVoters.map((voter) => (
                          <div
                            key={voter.id}
                            className="flex items-center gap-3 rounded-md bg-[#2b2d31] p-2"
                          >
                            {/* Avatar */}
                            <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-full bg-[#5865f2]">
                              {voter.imageurl ? (
                                <img
                                  src={voter.imageurl}
                                  alt={voter.username}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-white">
                                  {voter.username.charAt(0).toUpperCase()}
                                </div>
                              )}
                            </div>
                            
                            {/* Username */}
                            <span className="text-sm text-gray-200">
                              {voter.username}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
