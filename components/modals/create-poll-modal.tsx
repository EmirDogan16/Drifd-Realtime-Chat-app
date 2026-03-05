'use client';

import { useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import { useModalStore } from '@/hooks/use-modal-store';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { createClient } from '@/utils/supabase/client';

export function CreatePollModal() {
  const { type, isOpen, onClose, data } = useModalStore();
  const queryClient = useQueryClient();
  const [question, setQuestion] = useState('');
  const [answers, setAnswers] = useState<string[]>(['', '']);
  const [duration, setDuration] = useState('24');
  const [allowMultiple, setAllowMultiple] = useState(false);

  const isModalOpen = isOpen && type === 'createPoll';

  const handleClose = () => {
    setQuestion('');
    setAnswers(['', '']);
    setDuration('24');
    setAllowMultiple(false);
    onClose();
  };

  const handleAddAnswer = () => {
    if (answers.length < 10) {
      setAnswers([...answers, '']);
    }
  };

  const handleRemoveAnswer = (index: number) => {
    if (answers.length > 2) {
      setAnswers(answers.filter((_, i) => i !== index));
    }
  };

  const handleAnswerChange = (index: number, value: string) => {
    const newAnswers = [...answers];
    newAnswers[index] = value;
    setAnswers(newAnswers);
  };

  const handleSubmit = async () => {
    if (!question.trim() || answers.filter(a => a.trim()).length < 2) {
      alert('Lütfen soruyu ve en az 2 yanıtı doldurun.');
      return;
    }

    const validAnswers = answers.filter(a => a.trim());
    const endsAt = new Date(Date.now() + parseInt(duration) * 60 * 60 * 1000).toISOString();

    const pollData = {
      question,
      options: validAnswers.map((text, index) => ({
        id: `option-${index}`,
        text,
        votes: 0,
      })),
      total_votes: 0,
      ends_at: endsAt,
      allow_multiple: allowMultiple,
      has_voted: false,
      user_vote: null,
    };

    // Create poll message optimistically
    const pollMessage = {
      id: `optimistic-poll-${Date.now()}`,
      channelid: data.channelId,
      content: question,
      created_at: new Date().toISOString(),
      deleted: false,
      poll_data: pollData,
      memberid: data.memberId || 'temp-member-id',
      updated_at: new Date().toISOString(),
    };

    // Add to chat optimistically
    const queryKey = ['chat', data.channelId, 'channel'];
    queryClient.setQueryData<InfiniteData<any[]>>(queryKey, (prev) => {
      if (!prev) {
        return { pageParams: [0], pages: [[pollMessage]] };
      }
      const pages = prev.pages.map((page) => [...page]);
      const last = pages.length - 1;
      pages[last] = [...pages[last], pollMessage];
      return { ...prev, pages };
    });

    // Save poll to database
    const supabase = createClient();
    const { error } = await supabase
      .from('messages')
      .insert({
        content: question,
        poll_data: pollData,
        memberid: data.memberId,
        channelid: data.channelId,
        deleted: false,
      });

    if (error) {
      console.error('Error creating poll:', error);
      // Remove optimistic message on error
      queryClient.setQueryData<InfiniteData<any[]>>(queryKey, (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          pages: prev.pages.map((page) => page.filter((item) => item.id !== pollMessage.id)),
        };
      });
    }

    handleClose();
  };

  if (!isModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative w-full max-w-md rounded-lg bg-[#313338] shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4">
          <h2 className="text-xl font-bold text-white">Bir Anket Oluştur</h2>
          <button
            onClick={handleClose}
            className="rounded text-[#b5bac1] transition-colors hover:text-white"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[70vh] overflow-y-auto p-4 pt-0">
          {/* Question */}
          <div className="mb-4">
            <label className="mb-2 block text-xs font-semibold uppercase text-[#b5bac1]">Soru</label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Hangi soruyu sormak istiyorsun?"
              maxLength={300}
              className="w-full rounded bg-[#1e1f22] px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-[#5865f2]"
            />
            <div className="mt-1 text-right text-xs text-[#b5bac1]">{question.length} / 300</div>
          </div>

          {/* Answers */}
          <div className="mb-4">
            <label className="mb-2 block text-xs font-semibold uppercase text-[#b5bac1]">Yanıtlar</label>
            <div className="space-y-2">
              {answers.map((answer, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#4e5058] text-xs text-white">
                    {index + 1}
                  </div>
                  <input
                    type="text"
                    value={answer}
                    onChange={(e) => handleAnswerChange(index, e.target.value)}
                    placeholder="Yanıtını yaz"
                    maxLength={55}
                    className="flex-1 rounded bg-[#1e1f22] px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-[#5865f2]"
                  />
                  {answers.length > 2 && (
                    <button
                      onClick={() => handleRemoveAnswer(index)}
                      className="flex-shrink-0 text-[#b5bac1] transition-colors hover:text-red-400"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {answers.length < 10 && (
              <button
                onClick={handleAddAnswer}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded bg-[#1e1f22] py-2 text-sm font-medium text-[#b5bac1] transition-colors hover:bg-[#2b2d31]"
              >
                + Başka bir yanıt ekle
              </button>
            )}
          </div>

          {/* Duration */}
          <div className="mb-4">
            <label className="mb-2 block text-xs font-semibold uppercase text-[#b5bac1]">Süre</label>
            <select
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-full rounded bg-[#1e1f22] px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-[#5865f2]"
            >
              <option value="1">1 saat</option>
              <option value="4">4 saat</option>
              <option value="8">8 saat</option>
              <option value="24">24 saat</option>
              <option value="72">3 gün</option>
              <option value="168">1 hafta</option>
            </select>
          </div>

          {/* Allow Multiple */}
          <div className="mb-4 flex items-center gap-2">
            <input
              type="checkbox"
              id="allowMultiple"
              checked={allowMultiple}
              onChange={(e) => setAllowMultiple(e.target.checked)}
              className="h-5 w-5 rounded bg-[#1e1f22] accent-[#5865f2]"
            />
            <label htmlFor="allowMultiple" className="text-sm text-[#dbdee1]">
              Birden Fazla Yanıta izin Ver
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-[#3f4147] p-4">
          <button
            onClick={handleClose}
            className="rounded px-4 py-2 text-sm font-medium text-white transition-colors hover:underline"
          >
            İptal
          </button>
          <button
            onClick={handleSubmit}
            className="rounded bg-[#5865f2] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#4752c4]"
          >
            Gönder
          </button>
        </div>
      </div>
    </div>
  );
}
