import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import ShoutInput from './ShoutInput';
import ShoutCard from './ShoutCard';
import { Shout } from '../types';

const PAGE_SIZE = 10;

const ShoutFeed: React.FC = () => {
  const [sortBy, setSortBy] = useState<'new' | 'popular'>('new');
  const [showMedia, setShowMedia] = useState(true);

  const [shouts, setShouts] = useState<Shout[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  // Use ref for offset to avoid re-creating fetchShouts on every offset change
  const offsetRef = useRef(0);

  const fetchShouts = useCallback(async (reset = false) => {
    const currentOffset = reset ? 0 : offsetRef.current;

    if (reset) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }
    setError(null);

    console.log(`[ShoutFeed] Fetching shouts: reset=${reset}, offset=${currentOffset}, limit=${PAGE_SIZE}`);

    try {
      const res = await fetch(
        `/api/v1/shouts?limit=${PAGE_SIZE}&offset=${currentOffset}`,
        { credentials: 'include' }
      );

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      console.log(`[ShoutFeed] Received ${data.shouts.length} shouts, hasMore=${data.hasMore}`);

      setShouts(prev => reset ? data.shouts : [...prev, ...data.shouts]);
      setHasMore(data.hasMore);
      offsetRef.current = currentOffset + data.shouts.length;
    } catch (err) {
      console.error('[ShoutFeed] Fetch error:', err);
      setError('Не удалось загрузить вопли. Попробуй ещё раз.');
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, []);

  // Initial load — runs once on mount
  useEffect(() => {
    fetchShouts(true);
  }, [fetchShouts]);

  // Update a single shout's replies in local state (avoids full re-fetch after reply)
  const addReplyToShout = useCallback((shoutId: string, reply: Shout) => {
    console.log(`[ShoutFeed] Adding reply locally to shout ${shoutId}`);
    setShouts(prev =>
      prev.map(s =>
        s.id === shoutId
          ? { ...s, replies: [...(s.replies || []), reply] }
          : s
      )
    );
  }, []);

  const sortedShouts = useMemo(() => {
    const copy = [...shouts];
    if (sortBy === 'popular') {
      return copy.sort((a, b) => b.likes - a.likes);
    }
    return copy;
  }, [sortBy, shouts]);

  return (
    <div className="w-full">
      {/* Feed Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-white">Вопли</h1>

        <div className="flex items-center gap-4">
          <div className="flex bg-[#1e1e1e] rounded p-1">
            <button
              onClick={() => setSortBy('new')}
              className={`px-3 py-1 text-sm font-medium rounded shadow-sm transition-all ${
                sortBy === 'new'
                  ? 'bg-[#333] text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Все
            </button>
            <button
              onClick={() => setSortBy('popular')}
              className={`px-3 py-1 text-sm font-medium rounded shadow-sm transition-all ${
                sortBy === 'popular'
                  ? 'bg-[#333] text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Популярные
            </button>
          </div>

          <button
            onClick={() => setShowMedia(!showMedia)}
            className={`p-1 transition-colors ${
              showMedia
                ? 'text-white'
                : 'text-zinc-600 hover:text-zinc-400'
            }`}
            title={showMedia ? 'Скрыть медиа' : 'Показать медиа'}
          >
            👁
          </button>
        </div>
      </div>

      {/* Input */}
      <ShoutInput onShoutCreated={() => fetchShouts(true)} />

      {/* Initial Loading */}
      {isLoading && shouts.length === 0 && (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
        </div>
      )}

      {/* Error */}
      {!isLoading && error && (
        <div className="text-center text-red-400 text-sm mb-4">
          {error}
          <button
            onClick={() => fetchShouts(shouts.length === 0)}
            className="ml-2 underline hover:text-red-300"
          >
            Повторить
          </button>
        </div>
      )}

      {/* Empty */}
      {!isLoading && !error && shouts.length === 0 && (
        <div className="text-center text-zinc-500 text-sm py-8">
          Пока нет воплей. Будь первым
        </div>
      )}

      {/* Feed */}
      <div className="flex flex-col gap-6">
        {sortedShouts.map((shout) => (
          <ShoutCard
            key={shout.id}
            shout={shout}
            showMedia={showMedia}
            onReplyAdded={addReplyToShout}
          />
        ))}
      </div>

      {/* Load more */}
      {hasMore && !isLoading && (
        <div className="flex justify-center py-8">
          <button
            onClick={() => fetchShouts(false)}
            disabled={isLoadingMore}
            className="px-6 py-2 rounded-full border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoadingMore ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
                Загрузка...
              </span>
            ) : (
              'Загрузить ещё'
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default ShoutFeed;
