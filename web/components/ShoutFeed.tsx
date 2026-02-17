import React, { useState, useEffect, useCallback, useRef } from 'react';
import ShoutInput from './ShoutInput';
import ShoutCard from './ShoutCard';
import { Shout, Comment } from '../types';

const PAGE_SIZE = 10;

const ShoutFeed: React.FC = () => {
  const [sortBy, setSortBy] = useState<'new' | 'popular'>('new');
  const [showMedia, setShowMedia] = useState(true);

  const [shouts, setShouts] = useState<Shout[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  // Accordion: only one thread open at a time
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);

  const offsetRef = useRef(0);
  const sortByRef = useRef(sortBy);

  // Keep sortByRef in sync
  sortByRef.current = sortBy;

  const fetchShouts = useCallback(async (reset = false) => {
    const currentOffset = reset ? 0 : offsetRef.current;
    const currentSort = sortByRef.current;

    if (reset) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }
    setError(null);

    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(currentOffset),
      });
      if (currentSort === 'popular') {
        params.set('sortBy', 'popular');
      }

      const res = await fetch(`/api/v1/shouts?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

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

  // Initial load
  useEffect(() => {
    fetchShouts(true);
  }, [fetchShouts]);

  // Re-fetch when sortBy changes
  const handleSortChange = (newSort: 'new' | 'popular') => {
    if (newSort === sortBy) return;
    setSortBy(newSort);
    sortByRef.current = newSort;
    setOpenThreadId(null);
    offsetRef.current = 0;
    fetchShouts(true);
  };

  const addCommentToShout = useCallback((shoutId: string, comment: Comment) => {
    setShouts(prev =>
      prev.map(s =>
        s.id === shoutId
          ? { ...s, comments: [...(s.comments || []), comment] }
          : s
      )
    );
  }, []);

  const removeComment = useCallback((shoutId: string, commentId: string) => {
    setShouts(prev =>
      prev.map(s =>
        s.id === shoutId
          ? { ...s, comments: (s.comments || []).filter(c => c.id !== commentId) }
          : s
      )
    );
  }, []);

  const removeShout = useCallback((shoutId: string) => {
    setShouts(prev => prev.filter(s => s.id !== shoutId));
  }, []);

  // Accordion toggle: open clicked thread, close any previously open
  const handleThreadToggle = useCallback((shoutId: string) => {
    setOpenThreadId(prev => prev === shoutId ? null : shoutId);
  }, []);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-white">Вопли</h1>

        <div className="flex items-center gap-4">
          <div className="flex bg-[#1e1e1e] rounded p-1">
            <button
              onClick={() => handleSortChange('new')}
              className={`px-3 py-1 text-sm font-medium rounded shadow-sm transition-all ${
                sortBy === 'new' ? 'bg-[#333] text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Все
            </button>
            <button
              onClick={() => handleSortChange('popular')}
              className={`px-3 py-1 text-sm font-medium rounded shadow-sm transition-all ${
                sortBy === 'popular' ? 'bg-[#333] text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Популярные
            </button>
          </div>

          <button
            onClick={() => setShowMedia(!showMedia)}
            className={`p-1 transition-colors ${showMedia ? 'text-white' : 'text-zinc-600 hover:text-zinc-400'}`}
            title={showMedia ? 'Скрыть медиа' : 'Показать медиа'}
          >
            {'\uD83D\uDC41'}
          </button>
        </div>
      </div>

      <ShoutInput onShoutCreated={() => { sortByRef.current = sortBy; fetchShouts(true); }} />

      {isLoading && shouts.length === 0 && (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
        </div>
      )}

      {!isLoading && error && (
        <div className="text-center text-red-400 text-sm mb-4">
          {error}
          <button onClick={() => fetchShouts(shouts.length === 0)} className="ml-2 underline hover:text-red-300">Повторить</button>
        </div>
      )}

      {!isLoading && !error && shouts.length === 0 && (
        <div className="text-center text-zinc-500 text-sm py-8">
          {sortBy === 'popular' ? 'Нет популярных воплей за последние 7 дней' : 'Пока нет воплей. Будь первым'}
        </div>
      )}

      <div className="flex flex-col gap-6">
        {shouts.map((shout) => (
          <ShoutCard
            key={shout.id}
            shout={shout}
            showMedia={showMedia}
            onCommentAdded={addCommentToShout}
            onDelete={removeShout}
            onCommentDeleted={removeComment}
            isThreadOpen={openThreadId === shout.id}
            onThreadToggle={handleThreadToggle}
          />
        ))}
      </div>

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
