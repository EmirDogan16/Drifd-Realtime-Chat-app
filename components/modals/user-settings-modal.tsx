// @ts-nocheck
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { X, User, Bell, Lock, Palette, Info, Upload, Loader2, Gamepad2, LogOut, Mic, Volume2 } from 'lucide-react';
import { useVoiceSettings } from '@/hooks/use-voice-settings';
import { useModalStore } from '@/hooks/use-modal-store';
import { createClient } from '@/utils/supabase/client';

type SettingsTab = 'account' | 'privacy' | 'notifications' | 'appearance' | 'about' | 'activity' | 'voice';
type EditMode = 'username' | 'email' | 'password' | null;

/** Enumerate audio devices of a given kind */
function useSettingsAudioDevices(kind: 'audioinput' | 'audiooutput') {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    let mounted = true;

    const enumerate = async () => {
      try {
        if (kind === 'audioinput') {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach(t => t.stop());
        }
        const all = await navigator.mediaDevices.enumerateDevices();
        if (mounted) setDevices(all.filter(d => d.kind === kind && d.deviceId));
      } catch {
        // Permission denied or no devices
      }
    };

    enumerate();
    const onChange = () => { enumerate(); };
    navigator.mediaDevices.addEventListener('devicechange', onChange);
    return () => {
      mounted = false;
      navigator.mediaDevices.removeEventListener('devicechange', onChange);
    };
  }, [kind]);

  return devices;
}

/** Mic test: capture mic audio and play it back through speakers + measure level */
function useMicTest(deviceId: string, inputVolume: number) {
  const [isRunning, setIsRunning] = useState(false);
  const [level, setLevel] = useState(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animRef = useRef<number>(0);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: deviceId ? { exact: deviceId } : undefined },
      });
      streamRef.current = stream;

      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      const gain = ctx.createGain();
      gain.gain.value = inputVolume / 100;
      source.connect(gain);
      gain.connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!ctxRef.current || ctxRef.current.state === 'closed') return;
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((s, v) => s + v, 0) / data.length;
        setLevel(Math.min(100, avg * 1.5));
        animRef.current = requestAnimationFrame(tick);
      };
      tick();
      setIsRunning(true);
    } catch {
      // ignore
    }
  };

  const stop = () => {
    cancelAnimationFrame(animRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (ctxRef.current && ctxRef.current.state !== 'closed') {
      ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
    }
    setLevel(0);
    setIsRunning(false);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => { stop(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { isRunning, level, start, stop, toggle: () => isRunning ? stop() : start() };
}

function VoiceSettingsTab() {
  const { selectedInputDevice, selectedOutputDevice, inputVolume, outputVolume,
    pushToTalk, pushToTalkKey, update } = useVoiceSettings();
  const inputDevices = useSettingsAudioDevices('audioinput');
  const outputDevices = useSettingsAudioDevices('audiooutput');
  const micTest = useMicTest(selectedInputDevice, inputVolume);
  const [isRecordingPttKey, setIsRecordingPttKey] = useState(false);

  // PTT key recording
  useEffect(() => {
    if (!isRecordingPttKey) return;
    const handleKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      update({ pushToTalkKey: e.code });
      setIsRecordingPttKey(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isRecordingPttKey, update]);

  const getKeyDisplayName = (code: string) => {
    const map: Record<string, string> = {
      'KeyV': 'V', 'KeyB': 'B', 'KeyN': 'N', 'KeyM': 'M',
      'Space': 'Space', 'ShiftLeft': 'Sol Shift', 'ShiftRight': 'Sağ Shift',
      'ControlLeft': 'Sol Ctrl', 'ControlRight': 'Sağ Ctrl',
      'AltLeft': 'Sol Alt', 'AltRight': 'Sağ Alt',
      'CapsLock': 'Caps Lock', 'Tab': 'Tab',
    };
    if (map[code]) return map[code];
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    return code;
  };

  return (
    <div className="max-w-2xl">
      <h2 className="mb-6 text-2xl font-bold text-white">Ses</h2>

      {/* Device Selection Row */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Input Device */}
        <div>
          <label className="block text-xs font-semibold uppercase text-drifd-muted mb-2">Mikrofon</label>
          <select
            value={selectedInputDevice}
            onChange={(e) => update({ selectedInputDevice: e.target.value })}
            className="w-full rounded-md bg-drifd-hover px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#6F58F2] appearance-none cursor-pointer"
          >
            <option value="">Windows Varsayılanı</option>
            {inputDevices.map(d => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Mikrofon ${d.deviceId.slice(0, 8)}`}
              </option>
            ))}
          </select>
        </div>

        {/* Output Device */}
        <div>
          <label className="block text-xs font-semibold uppercase text-drifd-muted mb-2">Konuşmacı</label>
          <select
            value={selectedOutputDevice}
            onChange={(e) => update({ selectedOutputDevice: e.target.value })}
            className="w-full rounded-md bg-drifd-hover px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#6F58F2] appearance-none cursor-pointer"
          >
            <option value="">Windows Varsayılanı</option>
            {outputDevices.map(d => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Hoparlör ${d.deviceId.slice(0, 8)}`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Volume Sliders Row */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Input Volume */}
        <div>
          <label className="block text-xs font-semibold uppercase text-drifd-muted mb-2">Mikrofon Ses Seviyesi</label>
          <input
            type="range"
            min={0}
            max={100}
            value={inputVolume}
            onChange={(e) => update({ inputVolume: Number(e.target.value) })}
            className="w-full accent-[#5865F2] h-1.5 rounded-full cursor-pointer"
          />
        </div>

        {/* Output Volume */}
        <div>
          <label className="block text-xs font-semibold uppercase text-drifd-muted mb-2">Hoparlör Ses Seviyesi</label>
          <input
            type="range"
            min={0}
            max={100}
            value={outputVolume}
            onChange={(e) => update({ outputVolume: Number(e.target.value) })}
            className="w-full accent-[#5865F2] h-1.5 rounded-full cursor-pointer"
          />
        </div>
      </div>

      {/* Mic Test */}
      <div className="mb-8">
        <div className="flex items-center gap-4">
          <button
            onClick={micTest.toggle}
            className={`rounded-md px-5 py-2.5 text-sm font-semibold transition-colors ${
              micTest.isRunning
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-[#5865F2] text-white hover:bg-[#4752c4]'
            }`}
          >
            {micTest.isRunning ? 'Testi Durdur' : 'Mikrofon Testi'}
          </button>

          {/* Level Meter */}
          <div className="flex-1 h-4 bg-drifd-hover rounded-full overflow-hidden flex items-center px-0.5">
            {Array.from({ length: 30 }).map((_, i) => (
              <div
                key={i}
                className={`flex-1 h-2.5 mx-px rounded-sm transition-colors ${
                  micTest.isRunning && (i / 30) * 100 < micTest.level
                    ? 'bg-green-500'
                    : 'bg-[#4f545c]'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="h-px bg-drifd-divider my-6" />

      {/* Input Profile Section */}
      <div className="mb-6">
        <h3 className="text-sm font-bold text-white mb-3">Giriş Profili</h3>
        <div className="space-y-3">
          <label className="flex items-start gap-3 rounded-md p-3 cursor-pointer hover:bg-drifd-hover/30 transition-colors">
            <input type="radio" name="inputProfile" defaultChecked className="mt-1 h-4 w-4 accent-[#5865F2]" />
            <div>
              <p className="font-medium text-white">Ses İzolasyonu</p>
              <p className="text-sm text-drifd-muted">Drifd gürültüyü kessin, sadece senin güzel sesin duyulsun!</p>
            </div>
          </label>
          <label className="flex items-start gap-3 rounded-md p-3 cursor-pointer hover:bg-drifd-hover/30 transition-colors">
            <input type="radio" name="inputProfile" className="mt-1 h-4 w-4 accent-[#5865F2]" />
            <div>
              <p className="font-medium text-white">Stüdyo</p>
              <p className="text-sm text-drifd-muted">Saf ses: İşlemesiz açık mikrofon</p>
            </div>
          </label>
          <label className="flex items-start gap-3 rounded-md p-3 cursor-pointer hover:bg-drifd-hover/30 transition-colors">
            <input type="radio" name="inputProfile" className="mt-1 h-4 w-4 accent-[#5865F2]" />
            <div>
              <p className="font-medium text-white">Özel</p>
              <p className="text-sm text-drifd-muted">Gelişmiş mod: Bütün ayarları ve düğmeleri kurcalamana izin ver!</p>
            </div>
          </label>
        </div>
      </div>

      <div className="h-px bg-drifd-divider my-6" />

      {/* Push to Talk */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-white">Bas-Konuş</h3>
            <p className="text-xs text-drifd-muted mt-0.5">Mikrofon yalnızca tuşa basıldığında aktif olur</p>
          </div>
          <button
            onClick={() => update({ pushToTalk: !pushToTalk })}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              pushToTalk ? 'bg-[#5865F2]' : 'bg-[#72767d]'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                pushToTalk ? 'translate-x-5.5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {pushToTalk && (
          <div className="rounded-lg bg-drifd-hover p-4">
            <label className="block text-xs font-semibold uppercase text-drifd-muted mb-2">Kısayol Tuşu</label>
            <button
              onClick={() => setIsRecordingPttKey(true)}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                isRecordingPttKey
                  ? 'bg-red-600 text-white animate-pulse'
                  : 'bg-drifd-secondary text-white hover:bg-drifd-tertiary'
              }`}
            >
              {isRecordingPttKey ? 'Bir tuşa bas...' : getKeyDisplayName(pushToTalkKey)}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function UserSettingsModal() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { type, isOpen, onClose } = useModalStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>('account');
  const [profile, setProfile] = useState<{ username: string; email: string; imageurl: string | null; id: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState<EditMode>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Form states
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  useEffect(() => {
    if (isOpen && type === 'userSettings') {
      const loadProfile = async () => {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          const { data } = await supabase
            .from('profiles')
            .select('username, imageurl')
            .eq('id', user.id)
            .single();
          
          if (data) {
            const profileData = data as { username: string; imageurl: string | null };
            setProfile({ 
              username: profileData.username, 
              email: user.email || '', 
              imageurl: profileData.imageurl, 
              id: user.id 
            });
            setNewUsername(profileData.username);
            setNewEmail(user.email || '');
          }
        }
        setLoading(false);
      };
      
      void loadProfile();
    }
  }, [isOpen, type]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    setUploading(true);
    setFormError('');
    setFormSuccess('');

    try {
      const supabase = createClient();
      const fileExt = file.name.split('.').pop();
      const fileName = `${profile.id}-${Date.now()}.${fileExt}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      // Update profile
      const { error: updateError } = await supabase.from('profiles').update({ imageurl: publicUrl }).eq('id', profile.id);

      if (updateError) throw updateError;

      setProfile({ ...profile, imageurl: publicUrl });
      setFormSuccess('Profil resmi güncellendi!');
      
      console.log('[Profile Update] Avatar updated:', publicUrl);
      
      // Invalidate all queries and refresh server components
      await queryClient.invalidateQueries();
      router.refresh();
    } catch (error) {
      console.error('Avatar upload error:', error);
      setFormError('Profil resmi yüklenirken hata oluştu');
      
      // Check for specific error types
      if (error instanceof Error) {
        if (error.message.includes('Bucket not found')) {
          setFormError('Supabase Storage\'da "avatars" bucket\'ı oluşturulmalı. Supabase Dashboard > Storage > New Bucket > "avatars" (Public)');
        } else if (error.message.includes('row-level security') || error.message.includes('policy')) {
          setFormError('Supabase Storage policy hatası. Dashboard > Storage > avatars > Policies > New Policy ekle: INSERT için authenticated kullanıcılar');
        }
      }
    } finally {
      setUploading(false);
    }
  };

  const handleUsernameUpdate = async () => {
    if (!profile || !newUsername.trim()) {
      setFormError('Kullanıcı adı boş olamaz');
      return;
    }

    setLoading(true);
    setFormError('');
    setFormSuccess('');

    try {
      const supabase = createClient();
      const { error } = await supabase.from('profiles').update({ username: newUsername.trim() }).eq('id', profile.id);

      if (error) throw error;

      setProfile({ ...profile, username: newUsername.trim() });
      setFormSuccess('Kullanıcı adı güncellendi!');
      setEditMode(null);
      
      console.log('[Profile Update] Username updated:', newUsername.trim());
      
      // Invalidate all queries and refresh server components
      await queryClient.invalidateQueries();
      router.refresh();
    } catch (error) {
      console.error('Username update error:', error);
      setFormError('Kullanıcı adı güncellenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailUpdate = async () => {
    if (!newEmail.trim()) {
      setFormError('E-posta adresi boş olamaz');
      return;
    }

    setLoading(true);
    setFormError('');
    setFormSuccess('');

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });

      if (error) throw error;

      setFormSuccess('E-posta güncelleme linki gönderildi! Lütfen e-postanızı kontrol edin.');
      setEditMode(null);
    } catch (error) {
      console.error('Email update error:', error);
      setFormError('E-posta güncellenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordUpdate = async () => {
    if (!newPassword || !confirmPassword) {
      setFormError('Tüm alanları doldurun');
      return;
    }

    if (newPassword !== confirmPassword) {
      setFormError('Şifreler eşleşmiyor');
      return;
    }

    if (newPassword.length < 6) {
      setFormError('Şifre en az 6 karakter olmalı');
      return;
    }

    setLoading(true);
    setFormError('');
    setFormSuccess('');

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });

      if (error) throw error;

      setFormSuccess('Şifre başarıyla güncellendi!');
      setEditMode(null);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      console.error('Password update error:', error);
      setFormError('Şifre güncellenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    onClose();
    setActiveTab('account');
    setEditMode(null);
    setFormError('');
    setFormSuccess('');
  };

  const handleLogout = async () => {
    try {
      const supabase = createClient();
      
      // Get current user before signing out
      const { data: { user } } = await supabase.auth.getUser();
      
      // Set user as offline before logout
      if (user) {
        await supabase
          .from('profiles')
          .update({ status: 'offline' })
          .eq('id', user.id);
      }
      
      await supabase.auth.signOut();
      queryClient.clear();
      router.push('/');
      onClose();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (!isOpen || type !== 'userSettings') return null;

  const tabCategories = [
    {
      title: 'Kullanıcı Ayarları',
      tabs: [
        { id: 'account' as const, label: 'Hesabım', icon: User },
        { id: 'privacy' as const, label: 'Gizlilik & Güvenlik', icon: Lock },
      ]
    },
    {
      title: 'Etkinlik Ayarları',
      tabs: [
        { id: 'activity' as const, label: 'Kayıtlı Oyunlar', icon: Gamepad2 },
      ]
    },
    {
      title: 'Uygulama Ayarları',
      tabs: [
        { id: 'voice' as const, label: 'Ses ve Görüntü', icon: Mic },
        { id: 'notifications' as const, label: 'Bildirimler', icon: Bell },
        { id: 'appearance' as const, label: 'Görünüm', icon: Palette },
        { id: 'about' as const, label: 'Hakkında', icon: Info },
      ]
    }
  ];

  const getInitials = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return '?';
    const [first, second] = trimmed.split(/\s+/).filter(Boolean).slice(0, 2);
    return `${first?.[0] ?? ''}${second?.[0] ?? ''}`.toUpperCase() || trimmed[0]?.toUpperCase() || '?';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="relative flex h-[90vh] w-[90vw] max-w-6xl overflow-hidden rounded-lg bg-drifd-tertiary shadow-2xl">
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 z-10 rounded-full p-2 text-drifd-muted transition-colors hover:bg-drifd-hover hover:text-white"
          title="Kapat"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Sidebar */}
        <div className="flex w-64 flex-col border-r border-drifd-divider bg-drifd-secondary">
          <div className="flex-1 overflow-y-auto p-2">
            {tabCategories.map((category, categoryIndex) => (
              <div key={category.title} className={categoryIndex > 0 ? 'mt-4' : ''}>
                <div className="mb-2 px-2 py-1 text-xs font-semibold uppercase text-drifd-muted">
                  {category.title}
                </div>
                {category.tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`mb-1 flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ${
                        activeTab === tab.id
                          ? 'bg-drifd-hover text-white'
                          : 'text-drifd-muted hover:bg-drifd-hover hover:text-white'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          
          <div className="border-t border-drifd-divider p-3">
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-drifd-muted transition-colors hover:bg-red-600 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
              Çıkış Yap
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8">
          {activeTab === 'account' && (
            <div className="max-w-2xl">
              <h2 className="mb-6 text-2xl font-bold text-white">Hesabım</h2>
              
              {loading ? (
                <div className="text-drifd-muted">Yükleniyor...</div>
              ) : profile ? (
                <div className="space-y-6">
                  {/* Status Messages */}
                  {formError && (
                    <div className="rounded-lg bg-red-500/10 border border-red-500 p-4 text-red-400">
                      {formError}
                    </div>
                  )}
                  {formSuccess && (
                    <div className="rounded-lg bg-green-500/10 border border-green-500 p-4 text-green-400">
                      {formSuccess}
                    </div>
                  )}

                  {/* Profile Picture */}
                  <div className="rounded-lg border border-drifd-divider bg-drifd-secondary p-6">
                    <div className="flex items-center gap-4">
                      <div className="relative h-20 w-20 flex-shrink-0 rounded-full bg-drifd-hover group cursor-pointer"
                           onClick={() => fileInputRef.current?.click()}>
                        {uploading ? (
                          <div className="flex h-full w-full items-center justify-center">
                            <Loader2 className="h-8 w-8 animate-spin text-[#6F58F2]" />
                          </div>
                        ) : (
                          <>
                            {profile.imageurl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={profile.imageurl} alt={profile.username} className="h-full w-full rounded-full object-cover" />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center rounded-full text-xl font-bold text-white">
                                {getInitials(profile.username)}
                              </span>
                            )}
                            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Upload className="h-6 w-6 text-white" />
                            </div>
                          </>
                        )}
                        <span className="absolute -bottom-0.5 -right-0.5 z-20 h-5 w-5 rounded-full border-[2.5px] border-drifd-secondary bg-green-500 shadow-lg" />
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleAvatarUpload}
                        disabled={uploading}
                      />
                      <div className="flex-1">
                        <p className="text-lg font-semibold text-white">{profile.username}</p>
                        <p className="text-sm text-drifd-muted">{profile.email}</p>
                        <p className="text-xs text-drifd-muted mt-1">Fotoğrafı değiştirmek için tıklayın</p>
                      </div>
                    </div>
                  </div>

                  {/* Username */}
                  <div className="rounded-lg border border-drifd-divider bg-drifd-secondary p-6">
                    <h3 className="mb-4 text-sm font-semibold uppercase text-drifd-muted">Kullanıcı Adı</h3>
                    {editMode === 'username' ? (
                      <div className="space-y-3">
                        <input
                          type="text"
                          value={newUsername}
                          onChange={(e) => setNewUsername(e.target.value)}
                          className="w-full rounded-md bg-drifd-hover px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[#6F58F2]"
                          placeholder="Yeni kullanıcı adı"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleUsernameUpdate}
                            disabled={loading}
                            className="rounded-md bg-[#6F58F2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5B47D1] disabled:opacity-50"
                          >
                            {loading ? 'Kaydediliyor...' : 'Kaydet'}
                          </button>
                          <button
                            onClick={() => {
                              setEditMode(null);
                              setNewUsername(profile.username);
                              setFormError('');
                            }}
                            className="rounded-md bg-drifd-hover px-4 py-2 text-sm font-semibold text-white hover:bg-drifd-tertiary"
                          >
                            İptal
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-base font-medium text-white">{profile.username}</p>
                          <p className="text-sm text-drifd-muted">Sunucularda görünen isminiz</p>
                        </div>
                        <button
                          onClick={() => setEditMode('username')}
                          className="rounded-md bg-drifd-hover px-4 py-2 text-sm font-semibold text-white hover:bg-drifd-tertiary"
                        >
                          Değiştir
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Email */}
                  <div className="rounded-lg border border-drifd-divider bg-drifd-secondary p-6">
                    <h3 className="mb-4 text-sm font-semibold uppercase text-drifd-muted">E-posta Adresi</h3>
                    {editMode === 'email' ? (
                      <div className="space-y-3">
                        <input
                          type="email"
                          value={newEmail}
                          onChange={(e) => setNewEmail(e.target.value)}
                          className="w-full rounded-md bg-drifd-hover px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[#6F58F2]"
                          placeholder="Yeni e-posta adresi"
                        />
                        <p className="text-xs text-drifd-muted">Doğrulama linki yeni e-posta adresinize gönderilecek</p>
                        <div className="flex gap-2">
                          <button
                            onClick={handleEmailUpdate}
                            disabled={loading}
                            className="rounded-md bg-[#6F58F2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5B47D1] disabled:opacity-50"
                          >
                            {loading ? 'Gönderiliyor...' : 'Doğrulama Gönder'}
                          </button>
                          <button
                            onClick={() => {
                              setEditMode(null);
                              setNewEmail(profile.email);
                              setFormError('');
                            }}
                            className="rounded-md bg-drifd-hover px-4 py-2 text-sm font-semibold text-white hover:bg-drifd-tertiary"
                          >
                            İptal
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-base font-medium text-white">{profile.email}</p>
                          <p className="text-sm text-drifd-muted">Hesap kurtarma için kullanılır</p>
                        </div>
                        <button
                          onClick={() => setEditMode('email')}
                          className="rounded-md bg-drifd-hover px-4 py-2 text-sm font-semibold text-white hover:bg-drifd-tertiary"
                        >
                          Değiştir
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Password */}
                  <div className="rounded-lg border border-drifd-divider bg-drifd-secondary p-6">
                    <h3 className="mb-4 text-sm font-semibold uppercase text-drifd-muted">Şifre</h3>
                    {editMode === 'password' ? (
                      <div className="space-y-3">
                        <input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="w-full rounded-md bg-drifd-hover px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[#6F58F2]"
                          placeholder="Yeni şifre"
                        />
                        <input
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="w-full rounded-md bg-drifd-hover px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[#6F58F2]"
                          placeholder="Yeni şifre (tekrar)"
                        />
                        <p className="text-xs text-drifd-muted">Şifreniz en az 6 karakter olmalıdır</p>
                        <div className="flex gap-2">
                          <button
                            onClick={handlePasswordUpdate}
                            disabled={loading}
                            className="rounded-md bg-[#6F58F2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5B47D1] disabled:opacity-50"
                          >
                            {loading ? 'Güncelleniyor...' : 'Şifreyi Güncelle'}
                          </button>
                          <button
                            onClick={() => {
                              setEditMode(null);
                              setNewPassword('');
                              setConfirmPassword('');
                              setFormError('');
                            }}
                            className="rounded-md bg-drifd-hover px-4 py-2 text-sm font-semibold text-white hover:bg-drifd-tertiary"
                          >
                            İptal
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-base font-medium text-white">••••••••••</p>
                          <p className="text-sm text-drifd-muted">Güvenlik için düzenli olarak değiştirin</p>
                        </div>
                        <button
                          onClick={() => setEditMode('password')}
                          className="rounded-md bg-drifd-hover px-4 py-2 text-sm font-semibold text-white hover:bg-drifd-tertiary"
                        >
                          Değiştir
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-red-400">Profil yüklenemedi</div>
              )}
            </div>
          )}

          {activeTab === 'privacy' && (
            <div className="max-w-2xl">
              <h2 className="mb-6 text-2xl font-bold text-white">Gizlilik & Güvenlik</h2>
              <div className="space-y-4">
                <div className="rounded-lg border border-drifd-divider bg-drifd-secondary p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-white">Direkt Mesajlar</p>
                      <p className="text-sm text-drifd-muted">Sunucu üyelerinden DM alabilir</p>
                    </div>
                    <input type="checkbox" defaultChecked className="h-5 w-5" />
                  </div>
                </div>
                <div className="rounded-lg border border-drifd-divider bg-drifd-secondary p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-white">Çevrimiçi Durumu</p>
                      <p className="text-sm text-drifd-muted">Çevrimiçi durumunu göster</p>
                    </div>
                    <input type="checkbox" defaultChecked className="h-5 w-5" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="max-w-2xl">
              <h2 className="mb-6 text-2xl font-bold text-white">Bildirimler</h2>
              <div className="space-y-4">
                <div className="rounded-lg border border-drifd-divider bg-drifd-secondary p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-white">Masaüstü Bildirimleri</p>
                      <p className="text-sm text-drifd-muted">Yeni mesajlar için bildirim göster</p>
                    </div>
                    <input type="checkbox" defaultChecked className="h-5 w-5" />
                  </div>
                </div>
                <div className="rounded-lg border border-drifd-divider bg-drifd-secondary p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-white">Bildirim Sesi</p>
                      <p className="text-sm text-drifd-muted">Bildirimler için ses çal</p>
                    </div>
                    <input type="checkbox" defaultChecked className="h-5 w-5" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="max-w-2xl">
              <h2 className="mb-6 text-2xl font-bold text-white">Görünüm</h2>
              <div className="rounded-lg border border-drifd-divider bg-drifd-secondary p-6">
                <h3 className="mb-4 text-sm font-semibold uppercase text-drifd-muted">Tema</h3>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 rounded-md bg-drifd-hover p-3 cursor-pointer">
                    <input type="radio" name="theme" defaultChecked className="h-4 w-4" />
                    <div>
                      <p className="font-medium text-white">Koyu</p>
                      <p className="text-sm text-drifd-muted">Varsayılan koyu tema</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 rounded-md bg-drifd-tertiary p-3 cursor-pointer opacity-50">
                    <input type="radio" name="theme" disabled className="h-4 w-4" />
                    <div>
                      <p className="font-medium text-white">Açık (Yakında)</p>
                      <p className="text-sm text-drifd-muted">Henüz mevcut değil</p>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="max-w-2xl">
              <h2 className="mb-6 text-2xl font-bold text-white">Kayıtlı Oyunlar</h2>
              
              <div className="mb-6">
                <p className="text-sm text-drifd-muted mb-4">
                  Oyunlarla ilgili bilgiler (tür ve kapak görseli gibi) IGDB tarafından sağlanmaktadır.
                </p>
              </div>

              <div className="rounded-lg border border-drifd-divider bg-drifd-secondary p-6">
                <div className="text-center py-12">
                  <Gamepad2 className="h-16 w-16 text-drifd-muted mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-white mb-2">Oyun tespit edilemedi</h3>
                  <p className="text-sm text-drifd-muted mb-6">
                    Ne örniyorsun?
                  </p>
                  <button className="rounded-md bg-drifd-primary px-4 py-2 text-sm font-semibold text-black hover:opacity-90 transition-opacity">
                    Ekle
                  </button>
                </div>
              </div>

              <div className="mt-6 rounded-lg border border-drifd-divider bg-drifd-secondary p-4">
                <h3 className="text-sm font-semibold text-white mb-3">Eklenen Oyunlar</h3>
                <p className="text-xs text-drifd-muted">
                  Oyunlarla ilgili bilgiler bu bölümde görünecektir.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'voice' && (
            <VoiceSettingsTab />
          )}

          {activeTab === 'about' && (
            <div className="max-w-2xl">
              <h2 className="mb-6 text-2xl font-bold text-white">Hakkında</h2>
              <div className="space-y-6">
                <div className="rounded-lg border border-drifd-divider bg-drifd-secondary p-6 text-center">
                  <h1 className="mb-2 text-4xl font-bold text-[#6F58F2]">Drifd</h1>
                  <p className="mb-4 text-lg text-white">v1.0.0</p>
                  <p className="text-sm text-drifd-muted">
                    Modern iletişim platformu
                  </p>
                </div>
                
                <div className="rounded-lg border border-drifd-divider bg-drifd-secondary p-6">
                  <h3 className="mb-3 font-semibold text-white">Teknolojiler</h3>
                  <div className="space-y-2 text-sm text-drifd-muted">
                    <p>• Next.js 15</p>
                    <p>• Supabase (PostgreSQL + Auth)</p>
                    <p>• LiveKit (Ses/Video)</p>
                    <p>• TailwindCSS</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
