'use client';

import { useEffect, useState, useCallback } from 'react';

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
  const [settings, setSettings] = useState<VoiceSettings>(getStoredSettings);

  useEffect(() => {
    const handleChange = (e: Event) => {
      const ce = e as CustomEvent<VoiceSettings>;
      if (ce.detail) setSettings(ce.detail);
      else setSettings(getStoredSettings());
    };

    window.addEventListener('voice-settings-changed', handleChange);
    window.addEventListener('storage', () => setSettings(getStoredSettings()));

    return () => {
      window.removeEventListener('voice-settings-changed', handleChange);
      window.removeEventListener('storage', () => setSettings(getStoredSettings()));
    };
  }, []);

  const update = useCallback((patch: Partial<VoiceSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      setStoredSettings(next);
      broadcast(next);
      return next;
    });
  }, []);

  const toggleMute = useCallback(() => {
    setSettings(prev => {
      const next = { ...prev, isMuted: !prev.isMuted };
      setStoredSettings(next);
      broadcast(next);
      return next;
    });
  }, []);

  const toggleDeafen = useCallback(() => {
    setSettings(prev => {
      const next = {
        ...prev,
        isMuted: !prev.isDeafened ? true : prev.isMuted,
        isDeafened: !prev.isDeafened,
      };
      setStoredSettings(next);
      broadcast(next);
      return next;
    });
  }, []);

  return {
    ...settings,
    update,
    toggleMute,
    toggleDeafen,
  };
}
