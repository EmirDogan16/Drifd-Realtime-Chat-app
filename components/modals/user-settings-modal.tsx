// @ts-nocheck
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { X, User, Bell, Lock, Palette, Info, Upload, Loader2, Gamepad2, LogOut } from 'lucide-react';
import { useModalStore } from '@/hooks/use-modal-store';
import { createClient } from '@/utils/supabase/client';

type SettingsTab = 'account' | 'privacy' | 'notifications' | 'appearance' | 'about' | 'activity';
type EditMode = 'username' | 'email' | 'password' | null;

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
