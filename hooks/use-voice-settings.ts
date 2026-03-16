'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

export interface VoiceSettings {
  isMuted: boolean;
  isDeafened: boolean;
  selectedInputDevice: string;   // '' = system default
  selectedOutputDevice: string;  // '' = system default
  inputVolume: number;           // 0-100
  outputVolume: number;          // 0-100
  pushToTalk: boolean;
  pushToTalkKey: string;         // e.g. 'KeyV'
}

const STORAGE_KEY = 'drifd-voice-settings';

const DEFAULT_SETTINGS: VoiceSettings = {
  isMuted: false,
  isDeafened: false,
  selectedInputDevice: '',
  selectedOutputDevice: '',
  inputVolume: 75,
  outputVolume: 75,
  pushToTalk: false,
  pushToTalkKey: 'KeyV',
};

function getStoredSettings(): VoiceSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch {
    // ignore
  }

  return DEFAULT_SETTINGS;
}

function setStoredSettings(settings: VoiceSettings) {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

function broadcast(settings: VoiceSettings) {
  window.dispatchEvent(new CustomEvent('voice-settings-changed', { detail: settings }));
}

export function useVoiceSettings() {
  // Keep initial render deterministic between server and client to avoid hydration mismatch.
  const [settings, setSettings] = useState<VoiceSettings>(DEFAULT_SETTINGS);
  const settingsRef = useRef(settings);

  useEffect(() => {
    const stored = getStoredSettings();
    settingsRef.current = stored;
    setSettings(stored);
  }, []);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const commitSettings = useCallback((next: VoiceSettings, shouldBroadcast = true) => {
    settingsRef.current = next;
    setSettings(next);
    setStoredSettings(next);

    if (shouldBroadcast) {
      setTimeout(() => {
        broadcast(next);
      }, 0);
    }
  }, []);

  useEffect(() => {
    const handleChange = (e: Event) => {
      const ce = e as CustomEvent<VoiceSettings>;
      if (ce.detail) {
        commitSettings(ce.detail, false);
      } else {
        commitSettings(getStoredSettings(), false);
      }
    };

    const handleStorage = () => {
      commitSettings(getStoredSettings(), false);
    };

    window.addEventListener('voice-settings-changed', handleChange);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('voice-settings-changed', handleChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, [commitSettings]);

  const update = useCallback((patch: Partial<VoiceSettings>) => {
    const next = { ...settingsRef.current, ...patch };
    commitSettings(next);
  }, [commitSettings]);

  const toggleMute = useCallback(() => {
    const next = { ...settingsRef.current, isMuted: !settingsRef.current.isMuted };
    commitSettings(next);
  }, [commitSettings]);

  const toggleDeafen = useCallback(() => {
    const current = settingsRef.current;
    const next = {
      ...current,
      isMuted: !current.isDeafened ? true : current.isMuted,
      isDeafened: !current.isDeafened,
    };
    commitSettings(next);
  }, [commitSettings]);

  return {
    ...settings,
    update,
    toggleMute,
    toggleDeafen,
  };
}
