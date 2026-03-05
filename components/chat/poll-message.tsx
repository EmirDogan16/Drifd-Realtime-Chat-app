'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useModalStore } from '@/hooks/use-modal-store';

interface PollOption {
  id: string;
  text: string;
  votes: number;
}

interface PollMessageProps {
  messageId: string;
  channelId: string;
  pollData: any;
  currentUserId: string;
}

export function PollMessage({
  messageId,
  channelId,
  pollData,
  currentUserId,
}: PollMessageProps) {
  const { onOpen } = useModalStore();
  const votedUsers = pollData.voted_users || {};
  const userVote = votedUsers[currentUserId] || [];
  const hasVoted = userVote.length > 0;
  const allowMultiple = pollData.allow_multiple || false;

  const [selectedOptions, setSelectedOptions] = useState<string[]>(userVote);
  const [showResults, setShowResults] = useState(hasVoted);
  const [localPollData, setLocalPollData] = useState(pollData);
  const [timeRemaining, setTimeRemaining] = useState('');
  const [isPollEnded, setIsPollEnded] = useState(false);
  const [isVoting, setIsVoting] = useState(false);

  // Calculate votes from voted_users
  const calculateVotes = (data: any) => {
    const voteCounts: Record<string, number> = {};
    Object.values(data.voted_users || {}).forEach((votes: any) => {
      if (Array.isArray(votes)) {
        votes.forEach(optionId => {
          voteCounts[optionId] = (voteCounts[optionId] || 0) + 1;
        });
      }
    });
    return voteCounts;
  };

  const voteCounts = calculateVotes(localPollData);
  const totalVoters = Object.keys(localPollData.voted_users || {}).length;
  const localHasVoted = (localPollData.voted_users || {})[currentUserId]?.length > 0;

  // Note: Poll updates are handled by real-time subscriptions in chat-messages.tsx
  // No need for polling here

  // Timer - her saniye güncelle
  useEffect(() => {
    const updateTimer = () => {
      const now = new Date();
      const end = new Date(pollData.ends_at);
      const diff = end.getTime() - now.getTime();
      
      if (diff <= 0) {
        setTimeRemaining('Sona erdi');
        setIsPollEnded(true);
        setShowResults(true);
        return;
      }
      
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const days = Math.floor(hours / 24);
      
      if (days > 0) {
        setTimeRemaining(`${days} gün kaldı`);
      } else if (hours > 0) {
        setTimeRemaining(`${hours} saat kaldı`);
      } else {
        const minutes = Math.floor(diff / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeRemaining(`${minutes}dk. ${seconds}sn. kaldı`);
      }
    };

    updateTimer(); // İlk çalıştırma
    const interval = setInterval(updateTimer, 1000); // Her saniye

    return () => clearInterval(interval);
  }, [pollData.ends_at]);

  const handleOptionClick = (optionId: string) => {
    if (localHasVoted || isPollEnded) return;

    if (allowMultiple) {
      setSelectedOptions((prev) =>
        prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId]
      );
    } else {
      setSelectedOptions([optionId]);
    }
  };

  const handleVote = async () => {
    if (selectedOptions.length === 0 || isPollEnded) return;
    
    setIsVoting(true);
    
    // Update voted_users
    const updatedVotedUsers = {
      ...localPollData.voted_users,
      [currentUserId]: selectedOptions,
    };

    const updatedPollData = {
      ...localPollData,
      voted_users: updatedVotedUsers,
    };

    setLocalPollData(updatedPollData);
    setShowResults(true);

    // Save to backend
    const supabase = createClient();
    const { error } = await supabase
      .from('messages')
      .update({ poll_data: updatedPollData })
      .eq('id', messageId);

    if (error) {
      console.error('Error voting:', error);
      // Revert on error
      setLocalPollData(pollData);
    }
    
    setIsVoting(false);
  };

  const handleRemoveVote = async () => {
    if (!localHasVoted || isPollEnded) return;

    setIsVoting(true);
    
    // Remove from voted_users
    const updatedVotedUsers = { ...localPollData.voted_users };
    delete updatedVotedUsers[currentUserId];

    const updatedPollData = {
      ...localPollData,
      voted_users: updatedVotedUsers,
    };

    setLocalPollData(updatedPollData);
    setSelectedOptions([]);

    // Save to backend
    const supabase = createClient();
    const { error } = await supabase
      .from('messages')
      .update({ poll_data: updatedPollData })
      .eq('id', messageId);

    if (error) {
      console.error('Error removing vote:', error);
      // Revert on error
      setLocalPollData(pollData);
    }
    
    setIsVoting(false);
  };

  const getPercentage = (votes: number) => {
    if (totalVoters === 0) return 0;
    return Math.round((votes / totalVoters) * 100);
  };

  return (
    <div className="mt-2 rounded-lg border border-[#3f4147] bg-[#2b2d31] p-4 max-w-md">
      {/* Question */}
      <h4 className="mb-2 font-semibold text-white">{pollData.question}</h4>
      <p className="mb-3 text-xs text-[#b5bac1]">
        {showResults ? 'Sonuçlar' : pollData.allow_multiple ? 'Birden fazla seç' : 'Bir yanıt seç'}
      </p>

      {/* Options */}
      <div className="space-y-2">
        {pollData.options.map((option: PollOption) => {
          const votes = voteCounts[option.id] || 0;
          const percentage = getPercentage(votes);
          const isSelected = selectedOptions.includes(option.id);

          return (
            <button
              key={option.id}
              onClick={() => handleOptionClick(option.id)}
              disabled={localHasVoted || isPollEnded}
              className={`relative w-full overflow-hidden rounded border text-left transition-all ${
                isSelected && !showResults
                  ? 'border-[#5865f2] bg-[#5865f2]/10'
                  : 'border-[#3f4147] bg-[#1e1f22] hover:bg-[#2b2d31]'
              } ${localHasVoted || isPollEnded ? 'cursor-default' : 'cursor-pointer'}`}
            >
              {/* Vote percentage background */}
              {showResults && (
                <div
                  className="absolute inset-y-0 left-0 bg-[#5865f2]/20 transition-all"
                  style={{ width: `${percentage}%` }}
                />
              )}

              {/* Content */}
              <div className="relative flex items-center justify-between p-3">
                <div className="flex items-center gap-3 flex-1">
                  {/* Radio/Checkbox */}
                  <div
                    className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                      isSelected && !showResults
                        ? 'border-[#5865f2] bg-[#5865f2]'
                        : 'border-[#4e5058]'
                    }`}
                  >
                    {isSelected && !showResults && (
                      <div className="h-2 w-2 rounded-full bg-white" />
                    )}
                  </div>

                  {/* Option text */}
                  <span className="text-sm text-[#dbdee1]">{option.text}</span>
                </div>

                {/* Percentage and vote count */}
                {showResults && (
                  <div className="flex items-center gap-2 text-xs text-[#b5bac1]">
                    <span>{percentage}%</span>
                    <span>•</span>
                    <span>{votes} oy</span>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between text-xs text-[#b5bac1]">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onOpen('pollVoters', { pollData, pollQuestion: pollData.question, messageId })}
            className="font-medium hover:underline"
          >
            {totalVoters} kişi oy verdi
          </button>
          <span>•</span>
          <span>{timeRemaining}</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowResults(!showResults)}
            className="font-medium text-[#00a8fc] transition-colors hover:underline"
          >
            {showResults ? 'Oyları gizle' : 'Sonuçları göster'}
          </button>

          {!localHasVoted && !isPollEnded && (
            <button
              onClick={handleVote}
              disabled={selectedOptions.length === 0}
              className="rounded bg-[#5865f2] px-4 py-1.5 font-semibold text-white transition-colors hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Oyla
            </button>
          )}

          {localHasVoted && !isPollEnded && (
            <button
              onClick={handleRemoveVote}
              className="rounded bg-red-600 px-4 py-1.5 font-semibold text-white transition-colors hover:bg-red-700"
            >
              Oyu Kaldır
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
