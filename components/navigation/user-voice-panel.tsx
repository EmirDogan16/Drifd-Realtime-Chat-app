'use client';

import { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Headphones, HeadphoneOff, Settings, ChevronDown, ChevronRight, Check, Circle, Moon, MinusCircle, EyeOff } from 'lucide-react';
import { useVoiceSettings } from '@/hooks/use-voice-settings';
import { useModalStore } from '@/hooks/use-modal-store';
import { createClient } from '@/utils/supabase/client';

interface UserVoicePanelProps {
  profileId: string;
  username: string;
  imageUrl: string | null;
}

export function UserVoicePanel({ profileId, username: initialUsername, imageUrl: initialImageUrl }: UserVoicePanelProps) {
  const { isMuted, isDeafened, toggleMute, toggleDeafen } = useVoiceSettings();
  const { onOpen } = useModalStore();
  const [username, setUsername] = useState(initialUsername);
  const [imageUrl, setImageUrl] = useState(initialImageUrl);
  const [showInputMenu, setShowInputMenu] = useState(false);
  const [showOutputMenu, setShowOutputMenu] = useState(false);
  const [showProfileCard, setShowProfileCard] = useState(false);
  const [userStatus, setUserStatus] = useState<'online' | 'idle' | 'dnd' | 'invisible'>('online');
  const [inputVolume, setInputVolume] = useState(75);
  const [outputVolume, setOutputVolume] = useState(75);
  const [pushToTalk, setPushToTalk] = useState(false);
  
  const inputMenuRef = useRef<HTMLDivElement>(null);
  const outputMenuRef = useRef<HTMLDivElement>(null);
  const profileCardRef = useRef<HTMLDivElement>(null);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (inputMenuRef.current && !inputMenuRef.current.contains(event.target as Node)) {
        setShowInputMenu(false);
      }
      if (outputMenuRef.current && !outputMenuRef.current.contains(event.target as Node)) {
        setShowOutputMenu(false);
      }
      if (profileCardRef.current && !profileCardRef.current.contains(event.target as Node)) {
        setShowProfileCard(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Poll profile updates periodically
  useEffect(() => {
    const supabase = createClient();
    let lastUsername = initialUsername;
    let lastImageUrl = initialImageUrl;
    let lastStatus: string | null = null;
    
    const refreshProfile = async () => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('username, imageurl, status')
        .eq('id', profileId)
        .single() as { data: { username: string; imageurl: string | null; status: 'online' | 'idle' | 'dnd' | 'invisible' | null } | null };
      
      if (profile) {
        if (profile.username !== lastUsername || profile.imageurl !== lastImageUrl) {
          console.log('[UserVoicePanel] Profile updated:', profile);
          setUsername(profile.username);
          setImageUrl(profile.imageurl);
          lastUsername = profile.username;
          lastImageUrl = profile.imageurl;
        }
        if (profile.status && profile.status !== lastStatus) {
          setUserStatus(profile.status);
          lastStatus = profile.status;
        }
      }
    };
    
    // Initial load
    refreshProfile();
    
    // Poll every 1 second for fast updates
    const interval = setInterval(refreshProfile, 1000);
    
    return () => {
      clearInterval(interval);
    };
  }, [profileId, initialUsername, initialImageUrl]);

  // Heartbeat: Update last_seen every 30 seconds
  useEffect(() => {
    const supabase = createClient();
    
    const updateLastSeen = async () => {
      // Verify we have the right user ID
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user || user.id !== profileId) {
        console.error('[UserVoicePanel] ProfileId mismatch:', { 
          authUserId: user?.id, 
          profileId 
        });
        return;
      }
      
      const { error } = await supabase
        .from('profiles')
        .update({ last_seen: new Date().toISOString() })
        .eq('id', profileId);
      
      if (error) {
        console.error('[UserVoicePanel] Error updating last_seen:', error);
      }
    };

    // Initial heartbeat
    updateLastSeen();

    // Send heartbeat every 2 seconds
    const heartbeatInterval = setInterval(updateLastSeen, 2000);

    return () => {
      clearInterval(heartbeatInterval);
    };
  }, [profileId]);

  // Set offline when page is closed/unloaded
  useEffect(() => {
    const supabase = createClient();

    const handleBeforeUnload = async () => {
      // Use sendBeacon for reliability when page is closing
      const url = `/api/profile/offline`;
      navigator.sendBeacon(url, JSON.stringify({ profileId }));
      
      // Also try direct update (may not complete if page closes quickly)
      await supabase
        .from('profiles')
        .update({ status: 'offline' })
        .eq('id', profileId);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [profileId]);

  const getInitials = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return '?';
    const [first, second] = trimmed.split(/\s+/).filter(Boolean).slice(0, 2);
    return `${first?.[0] ?? ''}${second?.[0] ?? ''}`.toUpperCase() || trimmed[0]?.toUpperCase() || '?';
  };

  const getStatusColor = (status: typeof userStatus) => {
    switch (status) {
      case 'online': return 'bg-green-500';
      case 'idle': return 'bg-yellow-500';
      case 'dnd': return 'bg-red-500';
      case 'invisible': return 'bg-gray-500';
      default: return 'bg-green-500';
    }
  };

  const getStatusText = (status: typeof userStatus) => {
    switch (status) {
      case 'online': return 'Çevrimiçi';
      case 'idle': return 'Boşta';
      case 'dnd': return 'Rahatsız Etmeyin';
      case 'invisible': return 'Görünmez';
      default: return 'Çevrimiçi';
    }
  };

  const getStatusIcon = (status: typeof userStatus) => {
    switch (status) {
      case 'online': return <Circle className="h-3 w-3 fill-current" />;
      case 'idle': return <Moon className="h-3 w-3" />;
      case 'dnd': return <MinusCircle className="h-3 w-3" />;
      case 'invisible': return <EyeOff className="h-3 w-3" />;
      default: return <Circle className="h-3 w-3 fill-current" />;
    }
  };

  return (
    <div className="relative flex w-full flex-col gap-1.5 rounded-lg bg-[#292b2f] p-2" style={{ overflow: 'visible' }}>
      {/* Profile Card */}
      {showProfileCard && (
        <div 
          ref={profileCardRef}
          className="absolute bottom-full left-0 mb-2 w-[340px] rounded-lg bg-[#18191c] border border-[#3f4147] shadow-2xl z-40"
        >
          {/* Header Banner */}
          <div className="relative h-[60px] bg-gradient-to-br from-[#4752c4] to-[#3644a8] rounded-t-lg" />

          {/* Profile Section */}
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-start gap-4 -mt-10 mb-3">
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                <div className="relative h-[80px] w-[80px] rounded-full border-[6px] border-[#18191c] bg-drifd-hover">
                  {imageUrl ? (
                    <img src={imageUrl} alt={username} className="h-full w-full rounded-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center rounded-full text-2xl font-bold text-white">
                      {getInitials(username)}
                    </span>
                  )}
                  <span className={`absolute bottom-1 right-1 h-5 w-5 rounded-full border-[3px] border-[#18191c] ${getStatusColor(userStatus)}`} />
                </div>
              </div>
              
              {/* Username and Status */}
              <div className="flex-1 mt-12">
                <h3 className="text-xl font-bold text-white leading-none mb-0.5">{username}</h3>
                <p className="text-xs text-[#b5bac1]">{username.toLowerCase()}</p>
              </div>
            </div>

            <div className="h-px bg-[#3f4147] mb-3" />

            {/* Edit Profile Button */}
            <button
              onClick={() => {
                setShowProfileCard(false);
                onOpen('userSettings');
              }}
              className="w-full mb-2 rounded bg-white px-3 py-2 text-sm font-semibold text-[#18191c] hover:bg-gray-200 transition-colors"
            >
              Profili Düzenle
            </button>

            <div className="h-px bg-[#3f4147] my-3" />

            {/* Status Options */}
            <div className="space-y-0.5 mb-2">
              {[
                { value: 'online' as const, label: 'Çevrimiçi', icon: Circle, color: 'text-green-500', fillClass: 'fill-green-500' },
                { value: 'idle' as const, label: 'Boşta', icon: Moon, color: 'text-yellow-500', fillClass: 'fill-yellow-500' },
                { value: 'dnd' as const, label: 'Rahatsız Etmeyin', icon: MinusCircle, color: 'text-red-500', fillClass: 'fill-red-500' },
                { value: 'invisible' as const, label: 'Görünmez', icon: EyeOff, color: 'text-gray-500', fillClass: 'fill-gray-500' },
              ].map((status) => (
                <button
                  key={status.value}
                  onClick={async () => {
                    setUserStatus(status.value);
                    // Update status in database
                    const supabase = createClient();
                    await supabase.from('profiles').update({ status: status.value }).eq('id', profileId);
                  }}
                  className="w-full flex items-center gap-3 rounded px-2 py-2 hover:bg-[#3f4147] hover:text-white transition-colors group"
                >
                  <status.icon className={`h-4 w-4 ${status.color} ${status.fillClass}`} />
                  <div className="flex-1 text-left">
                    <div className="text-sm font-medium text-[#dbdee1] group-hover:text-white">{status.label}</div>
                  </div>
                  {userStatus === status.value && (
                    <Check className="h-4 w-4 text-white" />
                  )}
                </button>
              ))}
            </div>

            <div className="h-px bg-[#3f4147] my-2" />

            {/* Account Options */}
            <button
              onClick={() => {
                // TODO: Account switcher
              }}
              className="w-full flex items-center justify-between rounded px-2 py-2 text-sm font-medium text-[#dbdee1] hover:bg-[#3f4147] hover:text-white transition-colors"
            >
              <span>Hesap Değiştir</span>
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                // TODO: Manage accounts
              }}
              className="w-full flex items-center justify-between rounded px-2 py-2 text-sm font-medium text-[#dbdee1] hover:bg-[#3f4147] hover:text-white transition-colors"
            >
              <span>Hesapları Yönet</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* User Info */}
      <button 
        onClick={() => {
          setShowProfileCard(!showProfileCard);
          setShowInputMenu(false);
          setShowOutputMenu(false);
        }}
        className="flex items-center gap-2 px-1 rounded hover:bg-drifd-hover/50 transition-colors"
      >
        <div className="relative h-9 w-9 flex-shrink-0 rounded-full bg-drifd-hover">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt={username} className="h-full w-full rounded-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center rounded-full text-xs font-bold text-white">
              {getInitials(username)}
            </span>
          )}
          <span className={`absolute -bottom-0.5 -right-0.5 z-20 h-3.5 w-3.5 rounded-full border-[2.5px] border-[#292b2f] shadow-lg ${getStatusColor(userStatus)}`} />
        </div>
        <div className="overflow-hidden">
          <p className="truncate text-sm font-semibold text-white text-left">{username}</p>
          <p className="text-[11px] text-drifd-muted text-left">{getStatusText(userStatus)}</p>
        </div>
      </button>

      {/* Voice Controls */}
      <div className="flex items-center gap-1">
        {/* Input (Microphone) */}
        <div className="flex flex-1 gap-0.5 relative" ref={inputMenuRef}>
          <button
            type="button"
            onClick={toggleMute}
            className={`flex h-8 flex-1 items-center justify-center rounded-l transition-colors ${
              isMuted
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-drifd-hover text-drifd-muted hover:bg-drifd-secondary hover:text-white'
            }`}
            title={isMuted ? 'Sesi Aç' : 'Sessize Al'}
          >
            {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowInputMenu(!showInputMenu);
              setShowOutputMenu(false);
            }}
            className={`flex h-8 w-6 items-center justify-center rounded-r transition-colors ${
              isMuted
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-drifd-hover text-drifd-muted hover:bg-drifd-secondary hover:text-white'
            }`}
            title="Giriş Ayarları"
          >
            <ChevronDown className="h-3 w-3" />
          </button>

          {/* Input Settings Dropdown */}
          {showInputMenu && (
            <div className="absolute bottom-full left-0 mb-2 w-80 rounded-lg bg-drifd-tertiary border border-drifd-divider shadow-xl z-40 py-2">
              {/* Input Device */}
              <div className="px-3 py-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-white uppercase">Giriş Aygıtı</span>
                  <ChevronRight className="h-3 w-3 text-drifd-muted" />
                </div>
                <div className="text-xs text-drifd-muted">
                  Windows Varsayılanı (Mikrofon (Realtek(R) Audio))
                </div>
              </div>

              <div className="h-px bg-drifd-divider my-1" />

              {/* Input Profile */}
              <div className="px-3 py-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-white uppercase">Giriş Profili</span>
                  <ChevronRight className="h-3 w-3 text-drifd-muted" />
                </div>
                <div className="text-xs text-drifd-muted">
                  Ses İzolasyonu
                </div>
              </div>

              <div className="h-px bg-drifd-divider my-1" />

              {/* Input Volume */}
              <div className="px-3 py-2">
                <span className="text-xs font-semibold text-white uppercase block mb-3">Giriş Sesi</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={inputVolume}
                  onChange={(e) => setInputVolume(Number(e.target.value))}
                  className="w-full h-1 bg-drifd-divider rounded-lg appearance-none cursor-pointer accent-drifd-primary"
                  style={{
                    background: `linear-gradient(to right, #5865F2 0%, #5865F2 ${inputVolume}%, #3f4147 ${inputVolume}%, #3f4147 100%)`
                  }}
                />
              </div>

              <div className="h-px bg-drifd-divider my-1" />

              {/* Push to Talk */}
              <div className="px-3 py-2">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs font-semibold text-white uppercase">Bas-Konuş</span>
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={pushToTalk}
                      onChange={(e) => setPushToTalk(e.target.checked)}
                      className="sr-only"
                    />
                    <div className={`w-10 h-5 rounded-full transition-colors ${pushToTalk ? 'bg-drifd-primary' : 'bg-drifd-divider'}`}>
                      <div className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 ease-in-out transform ${pushToTalk ? 'translate-x-5' : 'translate-x-0.5'} mt-0.5`} />
                    </div>
                  </div>
                </label>
              </div>

              <div className="h-px bg-drifd-divider my-1" />

              {/* Voice Settings Link */}
              <button
                type="button"
                onClick={() => {
                  setShowInputMenu(false);
                  onOpen('userSettings');
                }}
                className="w-full px-3 py-2 flex items-center justify-between hover:bg-drifd-hover transition-colors"
              >
                <span className="text-xs font-semibold text-white uppercase">Ses Ayarları</span>
                <Settings className="h-3 w-3 text-drifd-muted" />
              </button>
            </div>
          )}
        </div>

        {/* Output (Headphones) */}
        <div className="flex flex-1 gap-0.5 relative" ref={outputMenuRef}>
          <button
            type="button"
            onClick={toggleDeafen}
            className={`flex h-8 flex-1 items-center justify-center rounded-l transition-colors ${
              isDeafened
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-drifd-hover text-drifd-muted hover:bg-drifd-secondary hover:text-white'
            }`}
            title={isDeafened ? 'Kulaklıkları Aç' : 'Sağırlaştır'}
          >
            {isDeafened ? <HeadphoneOff className="h-4 w-4" /> : <Headphones className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowOutputMenu(!showOutputMenu);
              setShowInputMenu(false);
            }}
            className={`flex h-8 w-6 items-center justify-center rounded-r transition-colors ${
              isDeafened
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-drifd-hover text-drifd-muted hover:bg-drifd-secondary hover:text-white'
            }`}
            title="Çıkış Ayarları"
          >
            <ChevronDown className="h-3 w-3" />
          </button>

          {/* Output Settings Dropdown */}
          {showOutputMenu && (
            <div className="absolute bottom-full left-0 mb-2 w-80 rounded-lg bg-drifd-tertiary border border-drifd-divider shadow-xl z-40 py-2">
              {/* Output Device */}
              <div className="px-3 py-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-white uppercase">Çıkış Aygıtı</span>
                  <ChevronRight className="h-3 w-3 text-drifd-muted" />
                </div>
                <div className="text-xs text-drifd-muted">
                  Hoparlör (Realtek(R) Audio)
                </div>
              </div>

              <div className="h-px bg-drifd-divider my-1" />

              {/* Output Volume */}
              <div className="px-3 py-2">
                <span className="text-xs font-semibold text-white uppercase block mb-3">Çıkış Sesi</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={outputVolume}
                  onChange={(e) => setOutputVolume(Number(e.target.value))}
                  className="w-full h-1 bg-drifd-divider rounded-lg appearance-none cursor-pointer accent-drifd-primary"
                  style={{
                    background: `linear-gradient(to right, #5865F2 0%, #5865F2 ${outputVolume}%, #3f4147 ${outputVolume}%, #3f4147 100%)`
                  }}
                />
              </div>

              <div className="h-px bg-drifd-divider my-1" />

              {/* Voice Settings Link */}
              <button
                type="button"
                onClick={() => {
                  setShowOutputMenu(false);
                  onOpen('userSettings');
                }}
                className="w-full px-3 py-2 flex items-center justify-between hover:bg-drifd-hover transition-colors"
              >
                <span className="text-xs font-semibold text-white uppercase">Ses Ayarları</span>
                <Settings className="h-3 w-3 text-drifd-muted" />
              </button>
            </div>
          )}
        </div>

        {/* Settings Button */}
        <button
          type="button"
          onClick={() => onOpen('userSettings')}
          className="flex h-8 w-8 items-center justify-center rounded bg-drifd-hover text-drifd-muted transition-colors hover:bg-drifd-secondary hover:text-white"
          title="Kullanıcı Ayarları"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
