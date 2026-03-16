'use client';

import { create } from 'zustand';

const STORAGE_KEY = 'drifd-chat-message-tools';

export type DraftMode = 'reply' | 'edit' | 'forward';

export interface ComposerDraft {
  mode: DraftMode;
  messageId: string;
  authorName: string;
  authorAvatarUrl?: string | null;
  content: string;
  fileUrl?: string | null;
}

type PinnedByScope = Record<string, Record<string, string>>;
type ReactionsByMessage = Record<string, Record<string, string[]>>;

interface PersistedState {
  pinnedByScope: PinnedByScope;
  reactionsByMessage: ReactionsByMessage;
}

interface ChatMessageToolsState extends PersistedState {
  drafts: Record<string, ComposerDraft | undefined>;
  setDraft: (scopeKey: string, draft: ComposerDraft) => void;
  clearDraft: (scopeKey: string) => void;
  togglePinned: (scopeKey: string, messageId: string) => void;
  reconcilePinnedScope: (scopeKey: string, validMessageIds: string[]) => void;
  toggleReaction: (messageId: string, emoji: string, profileId: string) => void;
}

function readPersistedState(): PersistedState {
  if (typeof window === 'undefined') {
    return { pinnedByScope: {}, reactionsByMessage: {} };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { pinnedByScope: {}, reactionsByMessage: {} };
    const parsed = JSON.parse(raw) as PersistedState;
    return {
      pinnedByScope: parsed.pinnedByScope || {},
      reactionsByMessage: parsed.reactionsByMessage || {},
    };
  } catch {
    return { pinnedByScope: {}, reactionsByMessage: {} };
  }
}

function writePersistedState(state: PersistedState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

const initialState = readPersistedState();

export const useChatMessageTools = create<ChatMessageToolsState>((set, get) => ({
  drafts: {},
  pinnedByScope: initialState.pinnedByScope,
  reactionsByMessage: initialState.reactionsByMessage,
  setDraft: (scopeKey, draft) => {
    set((state) => ({
      drafts: {
        ...state.drafts,
        [scopeKey]: draft,
      },
    }));
  },
  clearDraft: (scopeKey) => {
    set((state) => {
      const nextDrafts = { ...state.drafts };
      delete nextDrafts[scopeKey];
      return { drafts: nextDrafts };
    });
  },
  togglePinned: (scopeKey, messageId) => {
    set((state) => {
      const scopedPins = { ...(state.pinnedByScope[scopeKey] || {}) };
      if (scopedPins[messageId]) {
        delete scopedPins[messageId];
      } else {
        scopedPins[messageId] = new Date().toISOString();
      }

      const pinnedByScope = {
        ...state.pinnedByScope,
        [scopeKey]: scopedPins,
      };

      writePersistedState({ pinnedByScope, reactionsByMessage: state.reactionsByMessage });
      return { pinnedByScope };
    });
  },
  reconcilePinnedScope: (scopeKey, validMessageIds) => {
    set((state) => {
      const currentScopedPins = state.pinnedByScope[scopeKey] || {};
      const validIds = new Set(validMessageIds);
      const nextScopedPins = Object.fromEntries(
        Object.entries(currentScopedPins).filter(([messageId]) => validIds.has(messageId)),
      );

      const unchanged = Object.keys(currentScopedPins).length === Object.keys(nextScopedPins).length;
      if (unchanged) return state;

      const pinnedByScope = {
        ...state.pinnedByScope,
        [scopeKey]: nextScopedPins,
      };

      writePersistedState({ pinnedByScope, reactionsByMessage: state.reactionsByMessage });
      return { ...state, pinnedByScope };
    });
  },
  toggleReaction: (messageId, emoji, profileId) => {
    set((state) => {
      const messageReactions = { ...(state.reactionsByMessage[messageId] || {}) };
      const currentUsers = new Set(messageReactions[emoji] || []);

      if (currentUsers.has(profileId)) {
        currentUsers.delete(profileId);
      } else {
        currentUsers.add(profileId);
      }

      if (currentUsers.size === 0) {
        delete messageReactions[emoji];
      } else {
        messageReactions[emoji] = Array.from(currentUsers);
      }

      const reactionsByMessage = {
        ...state.reactionsByMessage,
        [messageId]: messageReactions,
      };

      writePersistedState({ pinnedByScope: state.pinnedByScope, reactionsByMessage });
      return { reactionsByMessage };
    });
  },
}));

export function buildReplyPrefix(draft: ComposerDraft) {
  const fallback = draft.fileUrl ? 'Eki görmek için tıkla' : 'Mesaj';
  const snippet = (draft.content.trim() || fallback).replace(/\s+/g, ' ').slice(0, 140);
  return `> ${draft.authorName}: ${snippet}`;
}

export function buildForwardPrefix(draft: ComposerDraft) {
  return `[İletildi • ${draft.authorName}]`;
}