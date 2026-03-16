'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Search, Send } from 'lucide-react';
import { useModalStore } from '@/hooks/use-modal-store';
import { createClient } from '@/utils/supabase/client';

interface Friend {
  id: string;
  username: string;
  avatarUrl: string | null;
  dmChannelId: string | null; // null = not yet created
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? '?').toUpperCase();
}

export function ForwardMessageModal() {
  const { isOpen, type, data, onClose } = useModalStore();
  const visible = isOpen && type === 'forwardMessage';

  const [friends, setFriends] = useState<Friend[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [extraNote, setExtraNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const forwardContent = data.forwardContent ?? '';
  const forwardFileUrl = data.forwardFileUrl ?? null;
  const forwardAuthorName = data.forwardAuthorName ?? '';

  // Build forwarded message text (same format as buildForwardPrefix)
  const buildForwardedText = useCallback(() => {
    const prefix = `[İletildi • ${forwardAuthorName}]`;
    const body = forwardContent || 'İletilen mesaj';
    return extraNote.trim()
      ? `${prefix}\n${body}\n\n${extraNote.trim()}`
      : `${prefix}\n${body}`;
  }, [forwardContent, forwardAuthorName, extraNote]);

  // Load friends when modal opens
  useEffect(() => {
    if (!visible) {
      // Reset state when closed
      setSearch('');
      setSelected(new Set());
      setExtraNote('');
      setSent(false);
      setFriends([]);
      return;
    }

    setLoading(true);
    const supabase = createClient();

    let cancelled = false;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      // Fetch accepted friendships where I am requester or addressee
      const { data: fships } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .eq('status', 'ACCEPTED')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

      if (cancelled) return;

      const friendIds = (fships ?? []).map((f: any) =>
        f.requester_id === user.id ? f.addressee_id : f.requester_id
      );

      if (friendIds.length === 0) {
        setFriends([]);
        setLoading(false);
        return;
      }

      // Fetch friend profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, imageurl')
        .in('id', friendIds);

      if (cancelled) return;

      // Fetch existing DM channels so we can reuse them
      const { data: dmChannels } = await supabase
        .from('dm_channels')
        .select('id, profile_one_id, profile_two_id')
        .or(`profile_one_id.eq.${user.id},profile_two_id.eq.${user.id}`);

      const dmMap = new Map<string, string>(); // friendId -> dmChannelId
      for (const ch of (dmChannels ?? []) as any[]) {
        const other = ch.profile_one_id === user.id ? ch.profile_two_id : ch.profile_one_id;
        dmMap.set(other, ch.id);
      }

      const result: Friend[] = ((profiles ?? []) as any[]).map((p: any) => ({
        id: p.id,
        username: p.username,
        avatarUrl: p.imageurl ?? null,
        dmChannelId: dmMap.get(p.id) ?? null,
      }));

      // Sort alphabetically
      result.sort((a, b) => a.username.localeCompare(b.username, 'tr'));
      setFriends(result);
      setLoading(false);

      setTimeout(() => searchRef.current?.focus(), 50);
    })();

    return () => { cancelled = true; };
  }, [visible]);

  const filteredFriends = friends.filter((f) =>
    f.username.toLowerCase().includes(search.toLowerCase())
  );

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSend = async () => {
    if (selected.size === 0 || sending) return;
    setSending(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSending(false); return; }

    const messageText = buildForwardedText();

    for (const friendId of selected) {
      const friend = friends.find((f) => f.id === friendId);
      if (!friend) continue;

      // Get or create DM channel
      let dmChannelId = friend.dmChannelId;
      if (!dmChannelId) {
        const newCh = {
          id: crypto.randomUUID(),
          profile_one_id: user.id < friendId ? user.id : friendId,
          profile_two_id: user.id < friendId ? friendId : user.id,
        };
        const { data: inserted } = await (supabase
          .from('dm_channels') as any)
          .upsert(newCh, { onConflict: 'profile_one_id,profile_two_id', ignoreDuplicates: false })
          .select('id')
          .single();
        dmChannelId = (inserted as any)?.id ?? newCh.id;
      }

      // Send the message
      await supabase.from('dm_channel_messages').insert({
        id: crypto.randomUUID(),
        content: messageText,
        fileurl: forwardFileUrl || null,
        author_id: user.id,
        dm_channel_id: dmChannelId,
      } as any);
    }

    setSending(false);
    setSent(true);
    setTimeout(() => onClose(), 900);
  };

  if (!visible) return null;

  // Preview snippet (at most 80 chars of the body)
  const previewBody = forwardContent.length > 80
    ? forwardContent.slice(0, 80) + '…'
    : forwardContent || 'İletilen mesaj';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="relative flex w-full max-w-[440px] flex-col rounded-lg bg-[#313338] shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-3">
          <div>
            <h2 className="text-xl font-bold text-white">Şu Kişiye İlet</h2>
            <p className="mt-0.5 text-sm text-[#949ba4]">Bu mesajı paylaşmak istediğin kişiyi seç.</p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[#949ba4] hover:bg-[#3f4248] hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pb-2">
          <div className="flex items-center gap-3 rounded-md border border-[#5865f2] bg-[#1e1f22] px-3 py-2">
            <Search className="h-4 w-4 flex-shrink-0 text-[#949ba4]" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ara"
              className="flex-1 bg-transparent text-sm text-white placeholder:text-[#949ba4] outline-none"
            />
          </div>
        </div>

        {/* Friends list */}
        <div className="mx-4 max-h-[300px] overflow-y-auto rounded-md">
          {loading ? (
            <p className="py-6 text-center text-sm text-[#949ba4]">Yükleniyor…</p>
          ) : filteredFriends.length === 0 ? (
            <p className="py-6 text-center text-sm text-[#949ba4]">
              {friends.length === 0 ? 'Henüz arkadaşın yok.' : 'Sonuç bulunamadı.'}
            </p>
          ) : (
            filteredFriends.map((friend) => {
              const isSelected = selected.has(friend.id);
              return (
                <button
                  key={friend.id}
                  type="button"
                  onClick={() => toggleSelect(friend.id)}
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 transition-colors ${
                    isSelected ? 'bg-[#5865f2]/20' : 'hover:bg-[#3f4248]'
                  }`}
                >
                  {/* Avatar */}
                  <div className="relative h-8 w-8 flex-shrink-0 overflow-hidden rounded-full bg-[#5865f2]">
                    {friend.avatarUrl ? (
                      <img src={friend.avatarUrl} alt={friend.username} className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-xs font-bold text-white">
                        {getInitials(friend.username)}
                      </span>
                    )}
                  </div>
                  {/* Name */}
                  <span className="flex-1 text-left text-sm font-medium text-[#dbdee1]">{friend.username}</span>
                  {/* Checkbox */}
                  <div className={`h-5 w-5 flex-shrink-0 rounded border-2 transition-colors flex items-center justify-center ${
                    isSelected
                      ? 'border-[#5865f2] bg-[#5865f2]'
                      : 'border-[#949ba4] bg-transparent'
                  }`}>
                    {isSelected && (
                      <svg viewBox="0 0 10 8" className="h-3 w-3 fill-white">
                        <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Divider */}
        <div className="mx-4 my-3 h-px bg-[#3f4248]" />

        {/* Message preview */}
        <div className="mx-4 mb-3 rounded-md bg-[#2b2d31] px-3 py-2.5">
          <div className="flex items-start gap-2">
            <svg viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 flex-shrink-0 fill-[#949ba4]">
              <path d="M2 2h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4l-3 3V3a1 1 0 0 1 1-1z" />
            </svg>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-[#949ba4] italic">İletildi</p>
              <p className="truncate text-sm text-[#dbdee1]">{previewBody}</p>
            </div>
          </div>
        </div>

        {/* Optional note input */}
        <div className="mx-4 mb-4 flex items-center gap-3 rounded-md bg-[#1e1f22] px-3 py-2.5">
          <input
            value={extraNote}
            onChange={(e) => setExtraNote(e.target.value)}
            placeholder="İsteğe bağlı bir mesaj ekle..."
            className="flex-1 bg-transparent text-sm text-white placeholder:text-[#949ba4] outline-none"
          />
          {/* Emoji placeholder */}
          <span className="text-lg select-none cursor-default">🙂</span>
          {/* Send button */}
          <button
            type="button"
            onClick={handleSend}
            disabled={selected.size === 0 || sending || sent}
            className={`flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-semibold transition-all ${
              sent
                ? 'bg-green-600 text-white'
                : selected.size === 0 || sending
                ? 'cursor-not-allowed bg-[#5865f2]/40 text-white/40'
                : 'bg-[#5865f2] text-white hover:bg-[#4752c4]'
            }`}
          >
            {sent ? 'Gönderildi ✓' : sending ? 'Gönderiliyor…' : (
              <>Gönder <Send className="h-3.5 w-3.5" /></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
