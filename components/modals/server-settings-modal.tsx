'use client';

import { useModalStore } from '@/hooks/use-modal-store';
import { X, Users, Puzzle, UserX, Search } from 'lucide-react';
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';

type SettingsSection = 'members' | 'roles' | 'integrations' | 'bans';

interface BannedUser {
  id: string;
  username: string;
  displayname: string;
  avatarurl: string | null;
  banned_at: string;
  banned_by: string;
}

interface ServerMember {
  id: string;
  username: string;
  imageurl: string | null;
}

export function ServerSettingsModal() {
  const { type, isOpen, onClose, data } = useModalStore();
  const { serverId, serverName } = data;
  const [activeSection, setActiveSection] = useState<SettingsSection>('bans');
  const [bannedUsers, setBannedUsers] = useState<BannedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ServerMember[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const isModalOpen = isOpen && type === 'serverSettings';

  useEffect(() => {
    if (isModalOpen && activeSection === 'bans') {
      fetchBannedUsers();
    }
  }, [isModalOpen, activeSection, serverId]);

  useEffect(() => {
    if (searchQuery.trim() && activeSection === 'bans') {
      searchMembers();
    } else {
      setSearchResults([]);
    }
  }, [searchQuery, activeSection]);

  const fetchBannedUsers = async () => {
    if (!serverId) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/servers/${serverId}/bans`);
      if (response.ok) {
        const data = await response.json();
        setBannedUsers(data.bans || []);
      }
    } catch (error) {
      console.error('Failed to fetch banned users:', error);
    } finally {
      setLoading(false);
    }
  };

  const searchMembers = async () => {
    if (!serverId || !searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const response = await fetch(`/api/servers/${serverId}/members?search=${encodeURIComponent(searchQuery)}`);
      if (response.ok) {
        const data = await response.json();
        // Filter out already banned users
        const bannedIds = bannedUsers.map(u => u.id);
        const filteredResults = (data.members || []).filter((m: ServerMember) => !bannedIds.includes(m.id));
        setSearchResults(filteredResults);
      }
    } catch (error) {
      console.error('Failed to search members:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleBan = async (userId: string) => {
    if (!serverId) return;

    try {
      const response = await fetch(`/api/servers/${serverId}/bans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      if (response.ok) {
        // Refresh banned users list
        await fetchBannedUsers();
        // Clear search
        setSearchQuery('');
        setSearchResults([]);
      }
    } catch (error) {
      console.error('Failed to ban user:', error);
    }
  };

  const handleUnban = async (userId: string) => {
    if (!serverId) return;

    try {
      const response = await fetch(`/api/servers/${serverId}/bans/${userId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setBannedUsers(bannedUsers.filter(user => user.id !== userId));
      }
    } catch (error) {
      console.error('Failed to unban user:', error);
    }
  };

  if (!isModalOpen) return null;

  const menuItems = [
    {
      category: 'people',
      label: 'KİŞİLER',
      items: [
        { id: 'members' as const, label: 'Üyeler', icon: Users },
        { id: 'roles' as const, label: 'Roller', icon: Users },
      ]
    },
    {
      category: 'apps',
      label: 'UYGULAMALAR',
      items: [
        { id: 'integrations' as const, label: 'Entegrasyonlar', icon: Puzzle },
      ]
    },
    {
      category: 'moderation',
      label: 'MODERASYON',
      items: [
        { id: 'bans' as const, label: 'Yasaklar', icon: UserX },
      ]
    }
  ];

  const getSectionTitle = () => {
    switch (activeSection) {
      case 'members': return 'Üyeler';
      case 'roles': return 'Roller';
      case 'integrations': return 'Entegrasyonlar';
      case 'bans': return 'Yasaklar';
      default: return '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-5xl h-[85vh] bg-[#313338] rounded-lg shadow-xl flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-[240px] bg-[#2B2D31] p-4 overflow-y-auto">
          <div className="mb-6">
            <h2 className="text-white font-semibold text-sm mb-1">{serverName}</h2>
          </div>

          {menuItems.map((section) => (
            <div key={section.category} className="mb-4">
              <h3 className="text-xs font-semibold text-[#B5BAC1] mb-1">
                {section.label}
              </h3>
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveSection(item.id)}
                    className={`
                      w-full flex items-center gap-2 px-2 py-2 mb-0.5 rounded text-sm font-medium
                      ${isActive ? 'bg-[#404249] text-white' : 'text-[#B5BAC1]'}
                      hover:bg-[#35373C] hover:text-[#DBDEE1] cursor-pointer
                      transition-colors
                    `}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-[#3f4147]">
            <h2 className="text-white font-semibold text-xl">{getSectionTitle()}</h2>
            <button
              onClick={onClose}
              className="text-[#B5BAC1] hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeSection === 'members' && (
              <div className="text-center py-12">
                <Users className="w-12 h-12 text-[#B5BAC1] mx-auto mb-3 opacity-50" />
                <p className="text-[#B5BAC1] text-sm">Üyeler sayfası yakında eklenecek</p>
              </div>
            )}

            {activeSection === 'roles' && (
              <div className="text-center py-12">
                <Users className="w-12 h-12 text-[#B5BAC1] mx-auto mb-3 opacity-50" />
                <p className="text-[#B5BAC1] text-sm">Roller sayfası yakında eklenecek</p>
              </div>
            )}

            {activeSection === 'integrations' && (
              <div className="text-center py-12">
                <Puzzle className="w-12 h-12 text-[#B5BAC1] mx-auto mb-3 opacity-50" />
                <p className="text-[#B5BAC1] text-sm">Entegrasyonlar sayfası yakında eklenecek</p>
              </div>
            )}

            {activeSection === 'bans' && (
              <div>
                {/* Search Section */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-[#B5BAC1] mb-2">
                    Kullanıcı Ara
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B5BAC1]" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Kullanıcı Kimliği veya Kullanıcı Adıyla Ara"
                      className="w-full bg-[#1E1F22] text-white px-10 py-2.5 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#5865F2]"
                    />
                  </div>

                  {/* Search Results */}
                  {searchQuery.trim() && (
                    <div className="mt-2 bg-[#2B2D31] rounded max-h-60 overflow-y-auto">
                      {isSearching ? (
                        <div className="text-[#B5BAC1] text-center py-4 text-sm">Aranıyor...</div>
                      ) : searchResults.length === 0 ? (
                        <div className="text-[#B5BAC1] text-center py-4 text-sm">Sonuç bulunamadı</div>
                      ) : (
                        <div>
                          {searchResults.map((member) => (
                            <div
                              key={member.id}
                              className="flex items-center justify-between p-3 hover:bg-[#35373C] transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-[#5865F2] flex items-center justify-center">
                                  {member.imageurl ? (
                                    <img
                                      src={member.imageurl}
                                      alt={member.username}
                                      className="w-8 h-8 rounded-full"
                                    />
                                  ) : (
                                    <span className="text-white text-sm font-semibold">
                                      {member.username.charAt(0).toUpperCase()}
                                    </span>
                                  )}
                                </div>
                                <span className="text-white text-sm">{member.username}</span>
                              </div>
                              <button
                                onClick={() => handleBan(member.id)}
                                className="px-3 py-1.5 bg-[#DA373C] hover:bg-[#A12D30] text-white text-xs font-medium rounded transition-colors"
                              >
                                Yasakla
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Banned Users List */}
                <div className="border-t border-[#3f4147] pt-4">
                  <h3 className="text-white font-semibold mb-2">Yasaklı Kullanıcılar</h3>
                  <p className="text-[#B5BAC1] text-sm mb-4">
                    Bu sunucudan yasaklanmış kullanıcılar. Yasakları kaldırmak için "Yasağı Kaldır" butonuna tıklayın.
                  </p>

                  {loading ? (
                    <div className="text-[#B5BAC1] text-center py-8">Yükleniyor...</div>
                  ) : bannedUsers.length === 0 ? (
                    <div className="text-center py-12">
                      <UserX className="w-12 h-12 text-[#B5BAC1] mx-auto mb-3 opacity-50" />
                      <p className="text-[#B5BAC1] text-sm">Yasaklı kullanıcı yok</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {bannedUsers.map((user) => (
                        <div
                          key={user.id}
                          className="flex items-center justify-between p-3 bg-[#2B2D31] rounded hover:bg-[#35373C] transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-[#5865F2] flex items-center justify-center">
                              {user.avatarurl ? (
                                <img
                                  src={user.avatarurl}
                                  alt={user.displayname}
                                  className="w-10 h-10 rounded-full"
                                />
                              ) : (
                                <span className="text-white font-semibold">
                                  {user.displayname.charAt(0).toUpperCase()}
                                </span>
                              )}
                            </div>
                            <div>
                              <p className="text-white font-medium">{user.displayname}</p>
                              <p className="text-[#B5BAC1] text-xs">@{user.username}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleUnban(user.id)}
                            className="px-4 py-2 bg-[#DA373C] hover:bg-[#A12D30] text-white text-sm font-medium rounded transition-colors"
                          >
                            Yasağı Kaldır
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
