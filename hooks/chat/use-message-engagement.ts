'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

interface UseMessageEngagementOptions {
  channelId: string;
  isDM?: boolean;
}

type PinnedByMessage = Record<string, string>;
type ReactionsByMessage = Record<string, Record<string, string[]>>;

interface ChannelPinRow {
  message_id: string;
  created_at: string;
}

interface ChannelReactionRow {
  message_id: string;
  emoji: string;
  profile_id: string;
}

interface EngagementEvent {
  v: 1;
  type: 'pin' | 'reaction';
  action: 'add' | 'remove';
  messageId: string;
  emoji?: string;
  profileId: string;
}

const ENGAGEMENT_PREFIX = '[ENGAGEMENT]';

function parseEngagementEvent(content: string): EngagementEvent | null {
  if (!content.startsWith(ENGAGEMENT_PREFIX)) return null;
  const raw = content.slice(ENGAGEMENT_PREFIX.length);
  try {
    const parsed = JSON.parse(raw) as EngagementEvent;
    if (!parsed || parsed.v !== 1 || !parsed.type || !parsed.action || !parsed.messageId || !parsed.profileId) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function useMessageEngagement({ channelId, isDM = false }: UseMessageEngagementOptions) {
  const [pinnedByMessage, setPinnedByMessage] = useState<PinnedByMessage>({});
  const [reactionsByMessage, setReactionsByMessage] = useState<ReactionsByMessage>({});
  const [isGlobalAvailable, setIsGlobalAvailable] = useState(false);
  const engagementFetchInFlightRef = useRef(false);

  const hasGlobalTableError = (error: any) => {
    const code = String(error?.code || '');
    const message = String(error?.message || '').toLowerCase();
    const status = Number(error?.status || 0);
    return (
      code === '42P01'
      || code === 'PGRST205'
      || status === 404
      || message.includes('does not exist')
      || message.includes('relation')
      || message.includes('not found')
    );
  };

  const loadEventFallbackState = useCallback(async () => {
    const supabase = createClient();
    const supabaseAny = supabase as any;
    const { data: events } = await supabaseAny
      .from('messages')
      .select('content, created_at')
      .eq('channelid', channelId)
      .like('content', `${ENGAGEMENT_PREFIX}%`)
      .order('created_at', { ascending: true })
      .limit(1000);

    const nextPinned: PinnedByMessage = {};
    const nextReactions: ReactionsByMessage = {};

    for (const row of (events || []) as Array<{ content: string; created_at: string }>) {
      const event = parseEngagementEvent(String(row.content || ''));
      if (!event) continue;

      if (event.type === 'pin') {
        if (event.action === 'add') {
          nextPinned[event.messageId] = row.created_at;
        } else {
          delete nextPinned[event.messageId];
        }
        continue;
      }

      if (!event.emoji) continue;
      if (!nextReactions[event.messageId]) nextReactions[event.messageId] = {};
      if (!nextReactions[event.messageId][event.emoji]) nextReactions[event.messageId][event.emoji] = [];

      const currentUsers = new Set(nextReactions[event.messageId][event.emoji]);
      if (event.action === 'add') {
        currentUsers.add(event.profileId);
      } else {
        currentUsers.delete(event.profileId);
      }

      if (currentUsers.size === 0) {
        delete nextReactions[event.messageId][event.emoji];
      } else {
        nextReactions[event.messageId][event.emoji] = Array.from(currentUsers);
      }
    }

    setPinnedByMessage(nextPinned);
    setReactionsByMessage(nextReactions);
  }, [channelId]);

  const insertSystemPinNotice = useCallback(async (profileId: string) => {
    const supabase = createClient();
    const supabaseAny = supabase as any;

    const { data: channel } = await supabaseAny
      .from('channels')
      .select('serverid')
      .eq('id', channelId)
      .maybeSingle();
    if (!channel?.serverid) return false;

    const { data: member } = await supabaseAny
      .from('members')
      .select('id')
      .eq('serverid', channel.serverid)
      .eq('profileid', profileId)
      .maybeSingle();
    if (!member?.id) return false;

    const { error } = await supabaseAny
      .from('messages')
      .insert({
        channelid: channelId,
        memberid: member.id,
        content: '[SYSTEM_PIN]',
        deleted: false,
      } as any);

    return !error;
  }, [channelId]);

  const fetchState = useCallback(async () => {
    if (engagementFetchInFlightRef.current) return;
    engagementFetchInFlightRef.current = true;

    try {
    if (isDM || channelId.startsWith('demo-')) {
      setPinnedByMessage({});
      setReactionsByMessage({});
      return;
    }

    if (!isGlobalAvailable) {
      await loadEventFallbackState();
      return;
    }

    const supabase = createClient();
    const supabaseAny = supabase as any;

    const [{ data: pins, error: pinError }, { data: reactions, error: reactionError }] = await Promise.all([
      supabaseAny
        .from('channel_message_pins')
        .select('message_id, created_at')
        .eq('channel_id', channelId),
      supabaseAny
        .from('channel_message_reactions')
        .select('message_id, emoji, profile_id')
        .eq('channel_id', channelId),
    ]);

    if (pinError || reactionError) {
      if (hasGlobalTableError(pinError) || hasGlobalTableError(reactionError)) {
        setIsGlobalAvailable(false);
        await loadEventFallbackState();
      }
      return;
    }

    setIsGlobalAvailable(true);

    if (!pinError && pins) {
      const pinRows = pins as unknown as ChannelPinRow[];
      const nextPinned: PinnedByMessage = {};
      for (const pin of pinRows) {
        nextPinned[pin.message_id] = pin.created_at;
      }
      setPinnedByMessage(nextPinned);
    }

    if (!reactionError && reactions) {
      const reactionRows = reactions as unknown as ChannelReactionRow[];
      const nextReactions: ReactionsByMessage = {};
      for (const reaction of reactionRows) {
        if (!nextReactions[reaction.message_id]) {
          nextReactions[reaction.message_id] = {};
        }
        if (!nextReactions[reaction.message_id][reaction.emoji]) {
          nextReactions[reaction.message_id][reaction.emoji] = [];
        }
        nextReactions[reaction.message_id][reaction.emoji].push(reaction.profile_id);
      }
      setReactionsByMessage(nextReactions);
    }
    } finally {
      engagementFetchInFlightRef.current = false;
    }
  }, [channelId, isDM, isGlobalAvailable, loadEventFallbackState]);

  useEffect(() => {
    void fetchState();

    if (isDM || channelId.startsWith('demo-')) return;

    const heartbeat = window.setInterval(() => {
      if (document.hidden) return;
      void fetchState();
    }, 15000);

    return () => window.clearInterval(heartbeat);
  }, [channelId, isDM, fetchState]);

  const togglePin = useCallback(async (messageId: string) => {
    if (isDM || channelId.startsWith('demo-')) return false;

    if (!isGlobalAvailable) {
      const supabase = createClient();
      const supabaseAny = supabase as any;
      const alreadyPinned = Boolean(pinnedByMessage[messageId]);
      const { data: userData } = await supabase.auth.getUser();
      const profileId = userData.user?.id;
      if (!profileId) return false;

      const { data: channel } = await supabaseAny
        .from('channels')
        .select('serverid')
        .eq('id', channelId)
        .maybeSingle();
      if (!channel?.serverid) return false;

      const { data: member } = await supabaseAny
        .from('members')
        .select('id')
        .eq('serverid', channel.serverid)
        .eq('profileid', profileId)
        .maybeSingle();
      if (!member?.id) return false;

      const eventPayload: EngagementEvent = {
        v: 1,
        type: 'pin',
        action: alreadyPinned ? 'remove' : 'add',
        messageId,
        profileId,
      };

      const eventContent = `${ENGAGEMENT_PREFIX}${JSON.stringify(eventPayload)}`;
      const { error: eventError } = await supabaseAny
        .from('messages')
        .insert({
          channelid: channelId,
          memberid: member.id,
          content: eventContent,
          deleted: false,
        } as any);
      if (eventError) return false;

      if (!alreadyPinned) {
        await insertSystemPinNotice(profileId);
      }

      await loadEventFallbackState();
      return !alreadyPinned;
    }

    const supabase = createClient();
    const supabaseAny = supabase as any;
    const alreadyPinned = Boolean(pinnedByMessage[messageId]);

    if (alreadyPinned) {
      const { error } = await supabaseAny
        .from('channel_message_pins')
        .delete()
        .eq('channel_id', channelId)
        .eq('message_id', messageId);
      if (error) {
        if (hasGlobalTableError(error)) {
          setIsGlobalAvailable(false);
          await loadEventFallbackState();
        }
        return false;
      }
    } else {
      const { data: userData } = await supabase.auth.getUser();
      const profileId = userData.user?.id;
      if (!profileId) return false;

      const { error } = await supabaseAny
        .from('channel_message_pins')
        .insert({
          channel_id: channelId,
          message_id: messageId,
          pinned_by_profile_id: profileId,
        } as any);
      if (error) {
        if (hasGlobalTableError(error)) {
          setIsGlobalAvailable(false);
          await loadEventFallbackState();
        }
        return false;
      }

      await insertSystemPinNotice(profileId);
    }

    await fetchState();
    return !alreadyPinned;
  }, [channelId, fetchState, insertSystemPinNotice, isDM, isGlobalAvailable, loadEventFallbackState, pinnedByMessage]);

  const toggleReaction = useCallback(async (messageId: string, emoji: string, profileId: string) => {
    if (isDM || channelId.startsWith('demo-')) return false;

    if (!isGlobalAvailable) {
      const existing = reactionsByMessage[messageId]?.[emoji] || [];
      const supabase = createClient();
      const supabaseAny = supabase as any;
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return false;

      const { data: channel } = await supabaseAny
        .from('channels')
        .select('serverid')
        .eq('id', channelId)
        .maybeSingle();
      if (!channel?.serverid) return false;

      const { data: member } = await supabaseAny
        .from('members')
        .select('id')
        .eq('serverid', channel.serverid)
        .eq('profileid', userId)
        .maybeSingle();
      if (!member?.id) return false;

      const eventPayload: EngagementEvent = {
        v: 1,
        type: 'reaction',
        action: existing.includes(profileId) ? 'remove' : 'add',
        messageId,
        emoji,
        profileId,
      };

      const eventContent = `${ENGAGEMENT_PREFIX}${JSON.stringify(eventPayload)}`;
      const { error } = await supabaseAny
        .from('messages')
        .insert({
          channelid: channelId,
          memberid: member.id,
          content: eventContent,
          deleted: false,
        } as any);

      if (error) return false;
      await loadEventFallbackState();
      return true;
    }

    const existing = reactionsByMessage[messageId]?.[emoji] || [];
    const supabase = createClient();
    const supabaseAny = supabase as any;

    if (existing.includes(profileId)) {
      const { error } = await supabaseAny
        .from('channel_message_reactions')
        .delete()
        .eq('channel_id', channelId)
        .eq('message_id', messageId)
        .eq('emoji', emoji)
        .eq('profile_id', profileId);
      if (error && hasGlobalTableError(error)) {
        setIsGlobalAvailable(false);
        await loadEventFallbackState();
        return false;
      }
    } else {
      const { error } = await supabaseAny
        .from('channel_message_reactions')
        .insert({
          channel_id: channelId,
          message_id: messageId,
          emoji,
          profile_id: profileId,
        } as any);
      if (error && hasGlobalTableError(error)) {
        setIsGlobalAvailable(false);
        await loadEventFallbackState();
        return false;
      }
    }

    await fetchState();
    return true;
  }, [channelId, fetchState, isDM, isGlobalAvailable, loadEventFallbackState, reactionsByMessage]);

  return useMemo(() => ({
    pinnedByMessage,
    reactionsByMessage,
    isGlobalAvailable,
    togglePin,
    toggleReaction,
    refreshEngagement: fetchState,
  }), [fetchState, isGlobalAvailable, pinnedByMessage, reactionsByMessage, togglePin, toggleReaction]);
}
