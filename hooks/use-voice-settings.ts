'use client';

import { useEffect, useState } from 'react';

interface VoiceSettings {
  isMuted: boolean;
  isDeafened: boolean;
}

const STORAGE_KEY = 'drifd-voice-settings';

function getStoredSettings(): VoiceSettings {
  if (typeof window === 'undefined') {
    return { isMuted: false, isDeafened: false };
  }
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // ignore
  }
  
  return { isMuted: false, isDeafened: false };
}

function setStoredSettings(settings: VoiceSettings) {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

export function useVoiceSettings() {
  const [settings, setSettings] = useState<VoiceSettings>(getStoredSettings);

  useEffect(() => {
    // Listen for changes from other components
    const handleStorageChange = () => {
      setSettings(getStoredSettings());
    };

    window.addEventListener('voice-settings-changed', handleStorageChange);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('voice-settings-changed', handleStorageChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const toggleMute = () => {
    const newSettings = { ...settings, isMuted: !settings.isMuted };
    setSettings(newSettings);
    setStoredSettings(newSettings);
    window.dispatchEvent(new CustomEvent('voice-settings-changed', { detail: newSettings }));
  };

  const toggleDeafen = () => {
    const newSettings = {
      isMuted: !settings.isDeafened ? true : settings.isMuted, // Deafening also mutes
      isDeafened: !settings.isDeafened,
    };
    setSettings(newSettings);
    setStoredSettings(newSettings);
    window.dispatchEvent(new CustomEvent('voice-settings-changed', { detail: newSettings }));
  };

  return {
    isMuted: settings.isMuted,
    isDeafened: settings.isDeafened,
    toggleMute,
    toggleDeafen,
  };
}
