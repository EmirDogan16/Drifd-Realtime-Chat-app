'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  LiveKitRoom,
  MediaDeviceMenu,
  RoomAudioRenderer,
  VideoTrack,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
  useTracks,
  VideoConference,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Track } from 'livekit-client';
import { ChevronDown, LogOut, Mic, MicOff, ScreenShare, ScreenShareOff, Video, VideoOff } from 'lucide-react';

type MediaChannelType = 'AUDIO' | 'VIDEO';

interface MediaRoomProps {
  channelId: string;
  channelName: string;
  channelType: MediaChannelType;
}

interface TokenResponse {
  token: string;
  url: string;
}

function getInitials(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '?';

  const [first, second] = trimmed
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  return `${first?.[0] ?? ''}${second?.[0] ?? ''}`.toUpperCase() || trimmed[0]?.toUpperCase() || '?';
}

function tryParseAvatarUrl(metadata: unknown): string | null {
  if (!metadata) return null;
  if (typeof metadata === 'string') {
    try {
      const parsed = JSON.parse(metadata) as { avatarUrl?: unknown };
      if (typeof parsed?.avatarUrl === 'string' && parsed.avatarUrl.trim()) return parsed.avatarUrl;
    } catch {
      // ignore
    }
  }

  return null;
}

function VoiceParticipantGrid() {
  const participants = useParticipants();

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {participants.map((participant) => {
        // LiveKit participant has: name (display name), identity (user ID), metadata (JSON string)
        const displayName = participant.name || participant.identity || 'Unknown';
        const isSpeaking = participant.isSpeaking;
        const avatarUrl = tryParseAvatarUrl(participant.metadata);

        const key = participant.sid ?? participant.identity ?? displayName;

        return (
          <div
            key={key}
            className={`relative flex aspect-video flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border bg-drifd-secondary p-4 transition-all ${
              isSpeaking ? 'border-green-500 ring-2 ring-green-500 ring-offset-2 ring-offset-drifd-tertiary' : 'border-drifd-divider'
            }`}
          >
            <div
              className={`flex h-24 w-24 items-center justify-center rounded-full transition-all ${
                isSpeaking ? 'bg-green-500/20 ring-4 ring-green-500' : 'bg-drifd-hover'
              }`}
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt={displayName} className="h-full w-full rounded-full object-cover" />
              ) : (
                <span className="text-2xl font-bold text-white">{getInitials(displayName)}</span>
              )}
            </div>

            <div className="flex flex-col items-center gap-1">
              <p className="text-sm font-semibold text-white">{displayName}</p>
              {isSpeaking ? (
                <span className="rounded-full bg-green-500 px-2 py-0.5 text-xs font-medium text-white">
                  Konuşuyor
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function VoiceStreamingLayout() {
  const screenShareTracks = useTracks([Track.Source.ScreenShare], { onlySubscribed: true });
  const screenShareTrack = screenShareTracks[0];

  if (!screenShareTrack) {
    return <VoiceParticipantGrid />;
  }

  const sharerName = screenShareTrack.participant.name || screenShareTrack.participant.identity || 'Unknown';

  return (
    <div className="flex h-full flex-col gap-4 lg:flex-row">
      <div className="min-h-[240px] flex-1 overflow-hidden rounded-xl border border-drifd-divider bg-black">
        <div className="relative h-full w-full">
          <VideoTrack trackRef={screenShareTrack} className="h-full w-full object-contain" />
          <div className="absolute bottom-3 left-3 rounded-md bg-drifd-tertiary/80 px-2 py-1 text-xs font-semibold text-white">
            {sharerName} yayında
          </div>
        </div>
      </div>

      <div className="max-h-[420px] overflow-y-auto lg:max-h-none lg:w-[360px]">
        <VoiceParticipantGrid />
      </div>
    </div>
  );
}

/** Applies output volume from voice settings to all <audio> elements rendered by LiveKit */
function OutputVolumeController() {
  useEffect(() => {
    const applyVolume = () => {
      try {
        const stored = localStorage.getItem('drifd-voice-settings');
        if (!stored) return;
        const settings = JSON.parse(stored);
        const vol = typeof settings.outputVolume === 'number' ? settings.outputVolume / 100 : 1;
        // LiveKit renders <audio> elements for remote participants
        document.querySelectorAll('audio').forEach(el => {
          el.volume = Math.max(0, Math.min(1, vol));
        });
      } catch { /* ignore */ }
    };

    applyVolume();

    // Re-apply when settings change
    const handler = () => applyVolume();
    window.addEventListener('voice-settings-changed', handler);

    // Also periodically apply in case new audio elements are created
    const interval = setInterval(applyVolume, 1000);

    return () => {
      window.removeEventListener('voice-settings-changed', handler);
      clearInterval(interval);
    };
  }, []);

  return null;
}

function DiscordControlBar({ showCamera, onLeave }: { showCamera: boolean; onLeave: () => void }) {
  const room = useRoomContext();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } = useLocalParticipant();
  const [busy, setBusy] = useState(false);

  // Apply stored voice settings on mount and listen for changes
  useEffect(() => {
    const applyVoiceSettings = async () => {
      if (typeof window === 'undefined') return;
      
      try {
        const stored = localStorage.getItem('drifd-voice-settings');
        if (stored) {
          const settings = JSON.parse(stored) as {
            isMuted: boolean;
            isDeafened: boolean;
            selectedInputDevice?: string;
            inputVolume?: number;
            selectedOutputDevice?: string;
            outputVolume?: number;
          };
          
          // Apply mute state if different from current
          if (settings.isMuted !== !isMicrophoneEnabled) {
            await localParticipant.setMicrophoneEnabled(!settings.isMuted);
          }

          // Apply selected input device
          if (settings.selectedInputDevice) {
            try {
              await room.switchActiveDevice('audioinput', settings.selectedInputDevice);
            } catch { /* device might not be available */ }
          }

          // Apply selected output device
          if (settings.selectedOutputDevice) {
            try {
              await room.switchActiveDevice('audiooutput', settings.selectedOutputDevice);
            } catch { /* device might not be available */ }
          }
        }
      } catch {
        // ignore
      }
    };

    // Apply settings on mount
    void applyVoiceSettings();

    // Listen for changes from UserVoicePanel
    const handleVoiceSettingsChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{
        isMuted: boolean;
        isDeafened: boolean;
        selectedInputDevice?: string;
        inputVolume?: number;
        selectedOutputDevice?: string;
        outputVolume?: number;
      }>;
      if (customEvent.detail) {
        void localParticipant.setMicrophoneEnabled(!customEvent.detail.isMuted);

        // Switch input device if changed
        if (typeof customEvent.detail.selectedInputDevice === 'string') {
          room.switchActiveDevice('audioinput', customEvent.detail.selectedInputDevice || 'default').catch(() => {});
        }

        // Switch output device if changed
        if (typeof customEvent.detail.selectedOutputDevice === 'string') {
          room.switchActiveDevice('audiooutput', customEvent.detail.selectedOutputDevice || 'default').catch(() => {});
        }
      }
    };

    window.addEventListener('voice-settings-changed', handleVoiceSettingsChanged);

    return () => {
      window.removeEventListener('voice-settings-changed', handleVoiceSettingsChanged);
    };
  }, [localParticipant, isMicrophoneEnabled, room]);

  const toggleMicrophone = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const newState = !isMicrophoneEnabled;
      await localParticipant.setMicrophoneEnabled(newState);
      
      // Update stored settings
      try {
        const stored = localStorage.getItem('drifd-voice-settings');
        const settings = stored ? JSON.parse(stored) : { isMuted: false, isDeafened: false };
        settings.isMuted = !newState;
        localStorage.setItem('drifd-voice-settings', JSON.stringify(settings));
        window.dispatchEvent(new CustomEvent('voice-settings-changed', { detail: settings }));
      } catch {
        // ignore
      }
    } finally {
      setBusy(false);
    }
  };

  const toggleCamera = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await localParticipant.setCameraEnabled(!isCameraEnabled);
    } finally {
      setBusy(false);
    }
  };

  const toggleScreenShare = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await localParticipant.setScreenShareEnabled(!isScreenShareEnabled, {
        video: {
          resolution: {
            width: 1920,
            height: 1080,
            frameRate: 60,
          },
        },
      });
    } finally {
      setBusy(false);
    }
  };

  const leave = () => {
    room.disconnect();
    onLeave();
  };

  return (
    <div className="flex h-16 items-center justify-center gap-3 px-4">
      <div className="flex overflow-hidden rounded-xl border border-drifd-divider bg-drifd-hover">
        <button
          type="button"
          onClick={toggleMicrophone}
          disabled={busy}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white hover:bg-drifd-secondary disabled:opacity-60"
        >
          {isMicrophoneEnabled ? (
            <Mic className="h-5 w-5" />
          ) : (
            <MicOff className="h-5 w-5 text-red-400" />
          )}
          <span>Microphone</span>
        </button>
        <MediaDeviceMenu
          kind="audioinput"
          className="flex items-center border-l border-drifd-divider px-3 text-white hover:bg-drifd-secondary"
        >
          <ChevronDown className="h-4 w-4" />
        </MediaDeviceMenu>
      </div>

      {showCamera ? (
        <div className="flex overflow-hidden rounded-xl border border-drifd-divider bg-drifd-hover">
          <button
            type="button"
            onClick={toggleCamera}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white hover:bg-drifd-secondary disabled:opacity-60"
          >
            {isCameraEnabled ? (
              <Video className="h-5 w-5" />
            ) : (
              <VideoOff className="h-5 w-5 text-red-400" />
            )}
            <span>Camera</span>
          </button>
          <MediaDeviceMenu
            kind="videoinput"
            className="flex items-center border-l border-drifd-divider px-3 text-white hover:bg-drifd-secondary"
          >
            <ChevronDown className="h-4 w-4" />
          </MediaDeviceMenu>
        </div>
      ) : null}

      <button
        type="button"
        onClick={toggleScreenShare}
        disabled={busy}
        className="flex items-center gap-2 rounded-xl border border-drifd-divider bg-drifd-hover px-4 py-2 text-sm font-semibold text-white hover:bg-drifd-secondary disabled:opacity-60"
      >
        {isScreenShareEnabled ? (
          <ScreenShareOff className="h-5 w-5" />
        ) : (
          <ScreenShare className="h-5 w-5" />
        )}
        <span>Share screen</span>
      </button>

      <button
        type="button"
        onClick={leave}
        className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
      >
        <LogOut className="h-5 w-5" />
        <span>Leave</span>
      </button>
    </div>
  );
}

export function MediaRoom({ channelId, channelName, channelType }: MediaRoomProps) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);

  const handleLeave = () => {
    // Navigate back to previous page or home
    router.back();
  };

  useEffect(() => {
    let isMounted = true;

    const loadToken = async () => {
      try {
        const response = await fetch(`/api/livekit?room=${encodeURIComponent(channelId)}`, {
          method: 'GET',
          cache: 'no-store',
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };

          if (response.status === 401) {
            throw new Error('Voice kanala girmek için giriş yapmalısın.');
          }

          if (response.status === 403) {
            throw new Error('Bu voice kanala erişimin yok (server üyesi değilsin).');
          }

          if (response.status === 400) {
            throw new Error(body.error ?? 'Geçersiz istek.');
          }

          throw new Error(body.error ?? 'LiveKit token alınamadı.');
        }

        const body = (await response.json()) as TokenResponse;

        if (isMounted) {
          setToken(body.token);
          setServerUrl(body.url);
        }
      } catch (tokenError) {
        if (isMounted) {
          setError(tokenError instanceof Error ? tokenError.message : 'Unknown LiveKit error');
        }
      }
    };

    void loadToken();

    return () => {
      isMounted = false;
    };
  }, [channelId]);

  const handleJoinChannel = async () => {
    setPermissionError(null);
    setIsRequesting(true);

    // Read selected input device from stored settings
    let selectedDevice: string | undefined;
    try {
      const stored = localStorage.getItem('drifd-voice-settings');
      if (stored) {
        const s = JSON.parse(stored);
        if (s.selectedInputDevice) selectedDevice = s.selectedInputDevice;
      }
    } catch { /* ignore */ }
    
    // Request appropriate permissions based on channel type
    try {
      const audioConstraints: MediaStreamConstraints['audio'] = selectedDevice
        ? { deviceId: { exact: selectedDevice } }
        : true;

      if (channelType === 'VIDEO') {
        await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: true });
      } else {
        await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      }
      
      // Permissions granted, connect to room
      setIsConnected(true);
    } catch (err) {
      const error = err as Error;
      setIsRequesting(false);
      
      if (error.name === 'NotAllowedError') {
        setPermissionError(
          'İzin reddedildi. Tarayıcı adres çubuğundaki kilit simgesine tıkla → Site ayarları → ' + 
          (channelType === 'VIDEO' ? 'Mikrofon ve Kamera' : 'Mikrofon') + ' → İzin ver'
        );
      } else if (error.name === 'NotFoundError') {
        setPermissionError(
          (channelType === 'VIDEO' ? 'Mikrofon veya kamera' : 'Mikrofon') + 
          ' bulunamadı. Cihazların bağlı olduğundan emin ol.'
        );
      } else {
        setPermissionError(`Hata: ${error.message}`);
      }
    }
  };

  if (error) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-drifd-tertiary">
        <div className="max-w-md rounded-xl border border-red-500/50 bg-drifd-secondary p-6 text-center">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!token || !serverUrl) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-drifd-tertiary">
        <div className="text-center">
          <div className="mb-4 text-4xl">🔊</div>
          <p className="text-lg font-semibold text-white">Bağlanıyor...</p>
        </div>
      </div>
    );
  }

  // Show join screen before connecting
  if (!isConnected) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-drifd-tertiary p-6">
        <div className="max-w-md rounded-xl border border-drifd-divider bg-drifd-secondary p-6 text-center shadow-xl">
          <div className="mb-4 text-5xl">
            {channelType === 'AUDIO' ? '🔊' : '🎥'}
          </div>
          <h2 className="mb-2 text-xl font-bold text-white">
            {channelName}
          </h2>
          <p className="mb-6 text-sm text-drifd-muted">
            {channelType === 'AUDIO' 
              ? 'Voice kanalına katılmak için mikrofon izni gerekiyor.'
              : 'Video kanalına katılmak için mikrofon ve kamera izni gerekiyor.'}
          </p>
          
          <button
            type="button"
            onClick={handleJoinChannel}
            disabled={isRequesting}
            className="w-full rounded-lg bg-green-600 px-6 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRequesting ? 'İzin isteniyor...' : 'Kanala Katıl'}
          </button>

          {permissionError ? (
            <div className="mt-4 rounded-lg border border-red-500/50 bg-red-900/20 p-3 text-left">
              <p className="text-xs leading-relaxed text-red-400">{permissionError}</p>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const isAudioOnly = channelType === 'AUDIO';

  // Read stored voice settings for device selection
  let storedInputDevice: string | undefined;
  try {
    const stored = localStorage.getItem('drifd-voice-settings');
    if (stored) {
      const s = JSON.parse(stored);
      if (s.selectedInputDevice) storedInputDevice = s.selectedInputDevice;
    }
  } catch { /* ignore */ }

  return (
    <div className="h-screen w-full bg-drifd-tertiary">
      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        connect={isConnected}
        audio={storedInputDevice ? { deviceId: { exact: storedInputDevice } } : true}
        video={!isAudioOnly}
        data-lk-theme="default"
        className="h-full"
      >
        <RoomAudioRenderer />
        <OutputVolumeController />
        {isAudioOnly ? (
          <div className="h-[calc(100%-64px)]">
            <div className="flex h-12 items-center justify-between border-b border-drifd-divider px-4">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-white">🔊 {channelName}</p>
                <span className="text-xs text-drifd-muted">Voice</span>
              </div>
              <p className="text-xs text-drifd-muted">Mikrofon ayarları altta</p>
            </div>
            <div className="h-[calc(100%-48px)] overflow-y-auto p-4">
                <VoiceStreamingLayout />
            </div>
          </div>
        ) : (
          <div className="h-[calc(100%-64px)]">
            <div className="flex h-12 items-center border-b border-drifd-divider px-4">
              <p className="text-sm font-bold text-white">🎥 {channelName}</p>
              <span className="ml-2 text-xs text-drifd-muted">Video Conference</span>
            </div>
            <div className="h-[calc(100%-48px)]">
              <VideoConference />
            </div>
          </div>
        )}
        <div className="h-16 border-t border-drifd-divider bg-drifd-secondary/60">
          <DiscordControlBar showCamera={true} onLeave={handleLeave} />
        </div>
      </LiveKitRoom>
    </div>
  );
}
