import { useState, useEffect, useRef, useCallback } from 'react';

export interface GifItem {
  id: string;
  title: string;
  url: string;
  still: string;
  width: number;
  height: number;
}

export interface FavoriteItem extends GifItem {
  favoriteId: string;
  createdAt: string;
}

export interface MyGifItem {
  id: string;
  mediaId: string;
  thumb: string;
  gif: string;
  createdAt: string;
}

const SEARCH_DEBOUNCE_MS = 400;
export const SEARCH_MIN_CHARS = 3;
// Matches MEDIA_MAX_BYTES in api/src/helpers/media.js
const GIF_MAX_BYTES = 10 * 1024 * 1024;

interface RawGif {
  id: string;
  title?: string;
  url: string;
  still: string;
  width: number;
  height: number;
}

function mapGif(g: RawGif): GifItem {
  return { id: g.id, title: g.title || '', url: g.url, still: g.still, width: g.width, height: g.height };
}

export function useGifPicker(isAuthenticated: boolean) {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GifItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [trending, setTrending] = useState<GifItem[]>([]);
  const [isTrendingLoading, setIsTrendingLoading] = useState(false);
  const [trendingError, setTrendingError] = useState<string | null>(null);
  const trendingFetchedRef = useRef(false);

  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [isFavoritesLoading, setIsFavoritesLoading] = useState(false);
  const favoritesFetchedRef = useRef(false);

  const [myGifs, setMyGifs] = useState<MyGifItem[]>([]);
  const [isMyGifsLoading, setIsMyGifsLoading] = useState(false);
  const myGifsFetchedRef = useRef(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeqRef = useRef(0);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const q = query.trim();
    if (q.length < SEARCH_MIN_CHARS) {
      setSearchResults([]);
      setSearchError(null);
      setIsSearching(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const seq = ++searchSeqRef.current;
      setIsSearching(true);
      setSearchError(null);
      try {
        const res = await fetch(`/api/v1/gifs/search?q=${encodeURIComponent(q)}`, { credentials: 'include' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`);
        if (seq !== searchSeqRef.current) return;
        setSearchResults((data.gifs || []).map(mapGif));
      } catch (err: unknown) {
        if (seq !== searchSeqRef.current) return;
        setSearchError(err instanceof Error ? err.message : 'Ошибка поиска GIF');
        setSearchResults([]);
      } finally {
        if (seq === searchSeqRef.current) setIsSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const fetchTrending = useCallback(async () => {
    if (trendingFetchedRef.current) return;
    trendingFetchedRef.current = true;
    setIsTrendingLoading(true);
    setTrendingError(null);
    try {
      const res = await fetch('/api/v1/gifs/trending', { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`);
      setTrending((data.gifs || []).map(mapGif));
    } catch (err: unknown) {
      trendingFetchedRef.current = false;
      setTrendingError(err instanceof Error ? err.message : 'Ошибка загрузки популярных GIF');
    } finally {
      setIsTrendingLoading(false);
    }
  }, []);

  const fetchFavorites = useCallback(async () => {
    if (!isAuthenticated || favoritesFetchedRef.current) return;
    favoritesFetchedRef.current = true;
    setIsFavoritesLoading(true);
    try {
      const res = await fetch('/api/v1/gifs/favorites', { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`);
      setFavorites((data.favorites || []).map((f: { id: string; giphyId: string; giphyUrl: string; giphyStill: string; width: number; height: number; createdAt: string }) => ({
        id: f.giphyId,
        title: '',
        url: f.giphyUrl,
        still: f.giphyStill,
        width: f.width,
        height: f.height,
        favoriteId: f.id,
        createdAt: f.createdAt,
      })));
    } catch {
      favoritesFetchedRef.current = false;
    } finally {
      setIsFavoritesLoading(false);
    }
  }, [isAuthenticated]);

  const isFavorite = useCallback((giphyId: string) => favorites.some((f) => f.id === giphyId), [favorites]);

  const toggleFavorite = useCallback(async (gif: GifItem) => {
    if (!isAuthenticated) return;
    const already = favorites.find((f) => f.id === gif.id);
    const prevFavorites = favorites;

    if (already) {
      setFavorites((prev) => prev.filter((f) => f.id !== gif.id));
      try {
        const res = await fetch(`/api/v1/gifs/favorites/${encodeURIComponent(gif.id)}`, {
          method: 'DELETE', credentials: 'include',
        });
        if (!res.ok && res.status !== 404) throw new Error();
      } catch {
        setFavorites(prevFavorites);
      }
    } else {
      const optimistic: FavoriteItem = { ...gif, favoriteId: gif.id, createdAt: new Date().toISOString() };
      setFavorites((prev) => [optimistic, ...prev]);
      try {
        const res = await fetch('/api/v1/gifs/favorites', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ giphyId: gif.id, giphyUrl: gif.url, giphyStill: gif.still, width: gif.width, height: gif.height }),
        });
        if (!res.ok) throw new Error();
      } catch {
        setFavorites(prevFavorites);
      }
    }
  }, [favorites, isAuthenticated]);

  const fetchMyGifs = useCallback(async () => {
    if (!isAuthenticated || myGifsFetchedRef.current) return;
    myGifsFetchedRef.current = true;
    setIsMyGifsLoading(true);
    try {
      const res = await fetch('/api/v1/gifs/my', { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`);
      setMyGifs(data.gifs || []);
    } catch {
      myGifsFetchedRef.current = false;
    } finally {
      setIsMyGifsLoading(false);
    }
  }, [isAuthenticated]);

  const uploadGif = useCallback(async (file: File) => {
    if (file.type !== 'image/gif') {
      setUploadError('Допустимый формат: GIF');
      return;
    }
    if (file.size > GIF_MAX_BYTES) {
      setUploadError('Файл слишком большой (макс. 10 МБ)');
      return;
    }

    setUploadError(null);
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/v1/gifs/upload', { method: 'POST', credentials: 'include', body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`);
      setMyGifs((prev) => [{ id: data.id, mediaId: data.mediaId, thumb: data.thumb, gif: data.gif, createdAt: new Date().toISOString() }, ...prev]);
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Ошибка загрузки');
    } finally {
      setIsUploading(false);
    }
  }, []);

  const deleteMyGif = useCallback(async (id: string) => {
    const prev = myGifs;
    setMyGifs((cur) => cur.filter((g) => g.id !== id));
    try {
      const res = await fetch(`/api/v1/gifs/my/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error();
    } catch {
      setMyGifs(prev);
    }
  }, [myGifs]);

  return {
    query, setQuery, searchResults, isSearching, searchError,
    trending, isTrendingLoading, trendingError, fetchTrending,
    favorites, isFavoritesLoading, fetchFavorites, isFavorite, toggleFavorite,
    myGifs, isMyGifsLoading, fetchMyGifs, uploadGif, isUploading, uploadError, deleteMyGif,
  };
}

export type UseGifPickerReturn = ReturnType<typeof useGifPicker>;
