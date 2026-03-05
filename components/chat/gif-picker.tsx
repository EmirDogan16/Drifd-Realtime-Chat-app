'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Search } from 'lucide-react';

interface GIF {
  id: string;
  url: string;
  preview: string;
  title: string;
}

interface TenorMediaFormat {
  url: string;
  duration?: number;
  dims?: number[];
  size?: number;
}

interface TenorMediaFormats {
  gif?: TenorMediaFormat;
  tinygif?: TenorMediaFormat;
  mediumgif?: TenorMediaFormat;
  nanogif?: TenorMediaFormat;
}

interface TenorGifItem {
  id: string;
  title: string;
  media_formats: TenorMediaFormats;
  content_description?: string;
}

interface GifPickerProps {
  onClose: () => void;
  onSelect: (gifUrl: string) => void;
}

export function GifPicker({ onClose, onSelect }: GifPickerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [gifs, setGifs] = useState<GIF[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextPos, setNextPos] = useState<string>('0');
  const [hasMore, setHasMore] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const limit = 25;

  const loadTrendingGifs = async (loadMore = false) => {
    if (loadMore) {
      if (loadingMore || !hasMore) return;
      setLoadingMore(true);
    } else {
      setLoading(true);
      setNextPos('0');
      setHasMore(true);
    }

    const currentPos = loadMore ? nextPos : '0';

    try {
      const response = await fetch(
        `/api/klipy/featured?limit=${limit}&pos=${currentPos}`
      );
      const data = await response.json();
      
      if (data && data.results && Array.isArray(data.results)) {
        const formattedGifs = data.results
          .filter((item: TenorGifItem) => item?.media_formats?.gif?.url && item?.media_formats?.tinygif?.url)
          .map((item: TenorGifItem) => ({
            id: item.id,
            url: item.media_formats.gif!.url,
            preview: item.media_formats.tinygif!.url,
            title: item.title || item.content_description || 'GIF',
          }));
        
        if (loadMore) {
          setGifs((prev) => {
            // Remove duplicates by ID
            const existingIds = new Set(prev.map((g: GIF) => g.id));
            const newGifs = formattedGifs.filter((g: GIF) => !existingIds.has(g.id));
            return [...prev, ...newGifs];
          });
        } else {
          setGifs(formattedGifs);
        }

        // Update next position from API response
        if (data.next) {
          setNextPos(data.next);
          setHasMore(true);
        } else {
          setHasMore(false);
        }
      } else {
        console.error('Invalid KLIPY API response:', data);
        if (!loadMore) setGifs([]);
        setHasMore(false);
      }
    } catch (error) {
      console.error('Error loading trending GIFs:', error);
      if (!loadMore) setGifs([]);
      setHasMore(false);
    } finally {
      if (loadMore) {
        setLoadingMore(false);
      } else {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    // Load trending GIFs on mount
    loadTrendingGifs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Infinite scroll handler
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => {
      // Don't load if already loading or no more items
      if (loadingMore || !hasMore) return;
      
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      // Load more when scrolled within 100px of bottom
      if (scrollHeight - scrollTop - clientHeight < 100) {
        if (searchTerm.trim()) {
          searchGifs(searchTerm, true);
        } else {
          loadTrendingGifs(true);
        }
      }
    };

    scrollContainer.addEventListener('scroll', handleScroll);
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, nextPos, loadingMore, hasMore]);

  const searchGifs = async (query: string, loadMore = false) => {
    if (!query.trim()) {
      loadTrendingGifs();
      return;
    }

    if (loadMore) {
      if (loadingMore || !hasMore) return;
      setLoadingMore(true);
    } else {
      setLoading(true);
      setNextPos('0');
      setHasMore(true);
    }

    const currentPos = loadMore ? nextPos : '0';

    try {
      const response = await fetch(
        `/api/klipy/search?q=${encodeURIComponent(query)}&limit=${limit}&pos=${currentPos}`
      );
      const data = await response.json();
      
      if (data && data.results && Array.isArray(data.results)) {
        const formattedGifs = data.results
          .filter((item: TenorGifItem) => item?.media_formats?.gif?.url && item?.media_formats?.tinygif?.url)
          .map((item: TenorGifItem) => ({
            id: item.id,
            url: item.media_formats.gif!.url,
            preview: item.media_formats.tinygif!.url,
            title: item.title || item.content_description || 'GIF',
          }));
        
        if (loadMore) {
          setGifs((prev) => {
            // Remove duplicates by ID
            const existingIds = new Set(prev.map((g: GIF) => g.id));
            const newGifs = formattedGifs.filter((g: GIF) => !existingIds.has(g.id));
            return [...prev, ...newGifs];
          });
        } else {
          setGifs(formattedGifs);
        }

        // Update next position from API response
        if (data.next) {
          setNextPos(data.next);
          setHasMore(true);
        } else {
          setHasMore(false);
        }
      } else {
        console.error('Invalid KLIPY API search response:', data);
        if (!loadMore) setGifs([]);
        setHasMore(false);
      }
    } catch (error) {
      console.error('Error searching GIFs:', error);
      if (!loadMore) setGifs([]);
      setHasMore(false);
    } finally {
      if (loadMore) {
        setLoadingMore(false);
      } else {
        setLoading(false);
      }
    }
  };

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    searchGifs(value);
  };

  return (
    <div className="absolute bottom-16 right-4 z-30 w-[420px] rounded-lg bg-[#2f3136] shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-drifd-divider p-3">
        <h3 className="text-sm font-semibold text-white">GIF Seç</h3>
        <button
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded text-drifd-muted transition-colors hover:bg-drifd-hover hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Search Bar */}
      <div className="border-b border-drifd-divider p-3">
        <div className="flex items-center gap-2 rounded-md bg-[#1e1f22] px-3 py-2">
          <Search className="h-4 w-4 text-drifd-muted" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="GIF ara..."
            className="flex-1 bg-transparent text-sm text-drifd-text outline-none placeholder:text-drifd-muted"
          />
        </div>
      </div>

      {/* GIF Grid */}
      <div ref={scrollContainerRef} className="h-[400px] overflow-y-auto p-2">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-drifd-muted">Yükleniyor...</p>
          </div>
        ) : gifs.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-drifd-muted">GIF bulunamadı</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {gifs.map((gif) => (
                <button
                  key={gif.id}
                  onClick={() => {
                    onSelect(gif.url);
                    onClose();
                  }}
                  className="group relative overflow-hidden rounded-md transition-transform hover:scale-105"
                >
                  <img src={gif.preview} alt={gif.title} className="h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-black opacity-0 transition-opacity group-hover:opacity-20" />
                </button>
              ))}
            </div>
            {loadingMore && (
              <div className="flex items-center justify-center py-4">
                <p className="text-sm text-drifd-muted">Daha fazla yükleniyor...</p>
              </div>
            )}
            {!hasMore && gifs.length > 0 && (
              <div className="flex items-center justify-center py-4">
                <p className="text-xs text-drifd-muted">Tüm GIF&apos;ler yüklendi</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-drifd-divider p-2 text-center">
        <a
          href="https://klipy.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-drifd-muted hover:underline"
        >
          Powered by KLIPY
        </a>
      </div>
    </div>
  );
}
