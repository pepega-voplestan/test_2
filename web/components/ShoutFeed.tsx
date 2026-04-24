import React, { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react';
import ShoutInput from './ShoutInput';
import ShoutCard from './ShoutCard';
import { Shout, Comment } from '../types';
import { useAuth } from '../context/AuthContext';
import { useContentPreferences } from '../context/ContentPreferencesContext';
import { useSSE } from '../hooks/useSSE';

const PAGE_SIZE = 25;

type FeedTab = 'new' | 'popular' | 'announcements';

interface Announcement {
  id: string;
  content: string;
  createdAt: string;
}

const AnnouncementBlock: React.FC<{ announcement: Announcement | null; isLoading: boolean; error: string | null }> = ({ announcement, isLoading, error }) => {
  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <div className="w-6 h-6 border-2 border-th-border border-t-th-text-3 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-red-400 text-sm py-8">{error}</div>
    );
  }

  if (!announcement) {
    return (
      <div className="text-center text-th-text-4 text-sm py-8">
        Нет объявлений
      </div>
    );
  }

  return (
    <div className="bg-th-card rounded-lg p-6 border border-th-border-2">
      <div className="text-th-text whitespace-pre-wrap break-words" dangerouslySetInnerHTML={{ __html: announcement.content }} />
      <div className="mt-4 text-xs text-th-text-4">
        {new Date(announcement.createdAt).toLocaleString('ru-RU', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </div>
    </div>
  );
};

const ShoutFeed: React.FC = () => {
  const { user } = useAuth();
  const { prefs, setShowMedia } = useContentPreferences();
  const [activeTab, setActiveTab] = useState<FeedTab>('new');
  type PopularSort = 'likes' | 'comments';
  const [popularSort, setPopularSort] = useState<PopularSort>('likes');
  const popularSortRef = useRef<PopularSort>('likes');

  const [shouts, setShouts] = useState<Shout[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  // Announcements state
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [announcementLoading, setAnnouncementLoading] = useState(false);
  const [announcementError, setAnnouncementError] = useState<string | null>(null);

  // Accordion: only one thread open at a time
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);

  // Scroll-anchor: prevents viewport jump when closing one thread opens another
  const shoutRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const scrollAnchorRef = useRef<{ id: string; top: number } | null>(null);

  // Cursor-based pagination for "new" tab (created_at of last loaded shout)
  const cursorRef = useRef<string | null>(null);
  // Offset-based pagination for "popular" tab (stable: no live mutations)
  const popularOffsetRef = useRef(0);
  const activeTabRef = useRef(activeTab);
  const userIdRef = useRef(user?.id);
  userIdRef.current = user?.id;

  // Sentinel element for IntersectionObserver-based infinite scroll
  const loaderRef = useRef<HTMLDivElement>(null);
  // Refs prevent stale closures inside the observer callback
  const isLoadingMoreRef = useRef(isLoadingMore);
  const isLoadingRef = useRef(isLoading);
  const hasMoreRef = useRef(hasMore);
  isLoadingMoreRef.current = isLoadingMore;
  isLoadingRef.current = isLoading;
  hasMoreRef.current = hasMore;

  // Keep ref in sync
  activeTabRef.current = activeTab;

  const fetchShoutsRef = useRef<(reset?: boolean) => Promise<void>>(async () => {});

  const fetchShouts = useCallback(async (reset = false) => {
    const currentTab = activeTabRef.current;

    if (reset) {
      setIsLoading(true);
      cursorRef.current = null;
      popularOffsetRef.current = 0;
    } else {
      setIsLoadingMore(true);
    }
    setError(null);

    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });

      if (currentTab === 'popular') {
        params.set('sortBy', 'popular');
        params.set('popularSort', popularSortRef.current);
        if (!reset) params.set('offset', String(popularOffsetRef.current));
      } else {
        // "new" tab: cursor-based
        if (!reset && cursorRef.current) params.set('cursor', cursorRef.current);
      }

      const res = await fetch(`/api/v1/shouts?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      setShouts(prev => reset ? data.shouts : [...prev, ...data.shouts]);
      setHasMore(data.hasMore);

      if (reset) {
        const pinnedId = (data.shouts as { id: string; isPinned?: boolean }[]).find(s => s.isPinned)?.id ?? null;
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key?.startsWith('pinnedCollapsed:') && key !== `pinnedCollapsed:${pinnedId}`) {
            localStorage.removeItem(key);
            i--;
          }
        }
      }

      if (currentTab === 'popular') {
        popularOffsetRef.current = (reset ? 0 : popularOffsetRef.current) + data.shouts.length;
      } else {
        cursorRef.current = data.nextCursor ?? null;
      }
    } catch (err) {
      console.error('[ShoutFeed] Fetch error:', err);
      setError('Не удалось загрузить вопли. Попробуй ещё раз.');
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, []);
  fetchShoutsRef.current = fetchShouts;

  const fetchAnnouncement = useCallback(async () => {
    setAnnouncementLoading(true);
    setAnnouncementError(null);
    try {
      const res = await fetch('/api/v1/announcements', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAnnouncement(data.announcement || null);
    } catch (err) {
      console.error('[ShoutFeed] Announcement fetch error:', err);
      setAnnouncementError('Не удалось загрузить объявления.');
    } finally {
      setAnnouncementLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchShouts(true);
  }, [fetchShouts]);

  // Infinite scroll: trigger fetchShouts when the sentinel enters the viewport
  useEffect(() => {
    const el = loaderRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMoreRef.current && !isLoadingMoreRef.current && !isLoadingRef.current) {
          fetchShouts(false);
        }
      },
      { rootMargin: '300px' } // start loading 300px before the sentinel is visible
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [fetchShouts]);

  const handleTabChange = (newTab: FeedTab) => {
    if (newTab === activeTab) return;
    setActiveTab(newTab);
    activeTabRef.current = newTab;
    setOpenThreadId(null);

    if (newTab === 'announcements') {
      fetchAnnouncement();
    } else {
      fetchShouts(true);
    }
  };

  const handlePopularSortChange = (sort: PopularSort) => {
    if (sort === popularSort) return;
    setPopularSort(sort);
    popularSortRef.current = sort;
    setOpenThreadId(null);
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
    setShouts(prev => prev.map(s =>
      s.id === shoutId ? { ...s, isDeleted: true, content: '', media: undefined, user: null } : s
    ));
  }, []);

  const editShout = useCallback((shoutId: string, newContent: string) => {
    setShouts(prev => prev.map(s => s.id === shoutId ? { ...s, content: newContent } : s));
  }, []);

  const editComment = useCallback((shoutId: string, commentId: string, newContent: string) => {
    setShouts(prev => prev.map(s => s.id === shoutId ? {
      ...s,
      comments: (s.comments || []).map(c => c.id === commentId ? { ...c, content: newContent } : c),
    } : s));
  }, []);

  // Accordion toggle: open clicked thread, close any previously open
  const handleThreadToggle = useCallback((shoutId: string) => {
    const el = shoutRefs.current.get(shoutId);
    if (el) {
      scrollAnchorRef.current = { id: shoutId, top: el.getBoundingClientRect().top };
    }
    setOpenThreadId(prev => prev === shoutId ? null : shoutId);
  }, []);

  // Restore scroll position after thread toggle to prevent viewport jump
  useLayoutEffect(() => {
    const anchor = scrollAnchorRef.current;
    if (!anchor) return;
    const el = shoutRefs.current.get(anchor.id);
    if (el) {
      const drift = el.getBoundingClientRect().top - anchor.top;
      if (Math.abs(drift) > 1) {
        window.scrollBy(0, drift);
      }
    }
    scrollAnchorRef.current = null;
  }, [openThreadId]);

  // --- SSE real-time updates ---
  const sseListeners = useMemo(() => ({
    new_shout: (data: Record<string, unknown>) => {
      if (data.userId === userIdRef.current) return;
      if (activeTabRef.current !== 'new') return;
      const shout = data.shout as Shout | undefined;
      if (shout) {
        setShouts(prev => {
          if (prev[0]?.isPinned) return [prev[0], shout, ...prev.slice(1)];
          return [shout, ...prev];
        });
      }
    },
    delete_shout: (data: Record<string, unknown>) => {
      if (data.userId === userIdRef.current) return;
      const shoutId = data.shoutId as string;
      setShouts(prev => prev.map(s =>
        s.id === shoutId ? { ...s, isDeleted: true, content: '', media: undefined, user: null } : s
      ));
    },
    pin_shout: (data: Record<string, unknown>) => {
      if (activeTabRef.current !== 'new') return;
      const shoutId = data.shoutId as string;
      setShouts(prev => {
        const idx = prev.findIndex(s => s.id === shoutId);
        if (idx === -1) {
          // Pinned shout not in feed — reload to show it at top
          fetchShoutsRef.current(true);
          return prev;
        }
        const pinned = { ...prev[idx], isPinned: true };
        const rest = prev.filter(s => s.id !== shoutId).map(s => ({ ...s, isPinned: false }));
        return [pinned, ...rest];
      });
    },
    unpin_shout: (data: Record<string, unknown>) => {
      const shoutId = data.shoutId as string;
      localStorage.removeItem(`pinnedCollapsed:${shoutId}`);
      setShouts(prev => {
        const idx = prev.findIndex(s => s.id === shoutId);
        if (idx === -1) return prev;
        const unpinned = { ...prev[idx], isPinned: false };
        const rest = prev.filter(s => s.id !== shoutId);
        // Insert in chronological order (newest first); drop if older than everything loaded
        const insertAt = rest.findIndex(s => s.timestamp < unpinned.timestamp);
        if (insertAt === -1) return rest; // falls off current page — remove it
        return [...rest.slice(0, insertAt), unpinned, ...rest.slice(insertAt)];
      });
    },
    new_comment: (data: Record<string, unknown>) => {
      if (data.userId === userIdRef.current) return;
      const shoutId = data.shoutId as string;
      const comment = data.comment as Comment | undefined;
      if (comment) {
        setShouts(prev => prev.map(s =>
          s.id === shoutId
            ? { ...s, comments: [...(s.comments || []), comment] }
            : s
        ));
      }
    },
    delete_comment: (data: Record<string, unknown>) => {
      if (data.userId === userIdRef.current) return;
      const shoutId = data.shoutId as string;
      const commentId = data.commentId as string;
      setShouts(prev => prev.map(s =>
        s.id === shoutId
          ? { ...s, comments: (s.comments || []).filter(c => c.id !== commentId) }
          : s
      ));
    },
    shout_like: (data: Record<string, unknown>) => {
      if (data.userId === userIdRef.current) return;
      const shoutId = data.shoutId as string;
      const likes = data.likes as number;
      setShouts(prev => prev.map(s =>
        s.id === shoutId ? { ...s, likes } : s
      ));
    },
    comment_like: (data: Record<string, unknown>) => {
      if (data.userId === userIdRef.current) return;
      const commentId = data.commentId as string;
      const likes = data.likes as number;
      setShouts(prev => prev.map(s => ({
        ...s,
        comments: (s.comments || []).map(c =>
          c.id === commentId ? { ...c, likes } : c
        ),
      })));
    },
    edit_shout: (data: Record<string, unknown>) => {
      const shoutId = data.shoutId as string;
      const content = data.content as string;
      setShouts(prev => prev.map(s => s.id === shoutId ? { ...s, content } : s));
    },
    edit_comment: (data: Record<string, unknown>) => {
      const shoutId = data.shoutId as string;
      const commentId = data.commentId as string;
      const content = data.content as string;
      setShouts(prev => prev.map(s => s.id === shoutId ? {
        ...s,
        comments: (s.comments || []).map(c => c.id === commentId ? { ...c, content } : c),
      } : s));
    },
    poll_update: (data: Record<string, unknown>) => {
      const pollId = data.pollId as string;
      const options = data.options as { id: string; votes: number }[];
      const totalVoters = data.totalVoters as number;
      setShouts(prev => prev.map(s => {
        if (!s.poll || s.poll.id !== pollId) return s;
        return {
          ...s,
          poll: {
            ...s.poll,
            totalVoters,
            options: s.poll.options.map(o => {
              const updated = options.find(u => u.id === o.id);
              return updated ? { ...o, votes: updated.votes } : o;
            }),
          },
        };
      }));
    },
  }), []);

  useSSE(sseListeners);

  return (
    <div className="w-full">
      <div className="flex items-center justify-end mb-6">
        <div className="flex items-center gap-4">
          <div className="flex bg-th-card rounded p-1">
            <button
              onClick={() => handleTabChange('new')}
              className={`px-3 py-1 text-sm font-medium rounded shadow-sm transition-all ${
                activeTab === 'new' ? 'bg-th-elevated text-th-text' : 'text-th-text-3 hover:text-th-text'
              }`}
            >
              Все
            </button>
            <div className="relative">
              {activeTab === 'popular' && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 flex bg-th-card rounded p-1 border border-th-border-2 shadow-sm">
                  <button
                    onClick={() => handlePopularSortChange('likes')}
                    className={`w-[26px] h-[26px] flex items-center justify-center rounded transition-all ${
                      popularSort === 'likes' ? 'bg-th-elevated text-th-text shadow-sm' : 'text-th-text-4 hover:text-th-text-2'
                    }`}
                    title="По лайкам"
                  >
                    <span className="text-sm leading-none">{'\uD83E\uDD18'}</span>
                  </button>
                  <button
                    onClick={() => handlePopularSortChange('comments')}
                    className={`w-[26px] h-[26px] flex items-center justify-center rounded transition-all ${
                      popularSort === 'comments' ? 'bg-th-elevated text-th-text shadow-sm' : 'text-th-text-4 hover:text-th-text-2'
                    }`}
                    title="По комментариям"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zm-4 0H9v2h2V9z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              )}
              <button
                onClick={() => handleTabChange('popular')}
                className={`px-3 py-1 text-sm font-medium rounded shadow-sm transition-all ${
                  activeTab === 'popular' ? 'bg-th-elevated text-th-text' : 'text-th-text-3 hover:text-th-text'
                }`}
              >
                Популярные
              </button>
            </div>
            <button
              onClick={() => handleTabChange('announcements')}
              className={`px-3 py-1 text-sm font-medium rounded shadow-sm transition-all ${
                activeTab === 'announcements' ? 'bg-th-elevated text-th-text' : 'text-th-text-3 hover:text-th-text'
              }`}
            >
              Объявления
            </button>
          </div>

          <button
            onClick={() => setShowMedia(!prefs.showMedia)}
            className={`relative p-1.5 transition-colors ${prefs.showMedia ? 'text-th-text-3 hover:text-th-text' : 'text-th-text-4 hover:text-th-text-3'}`}
            title={prefs.showMedia ? 'Скрыть медиа' : 'Показать медиа'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
            {!prefs.showMedia && (
              <svg xmlns="http://www.w3.org/2000/svg" className="absolute inset-0 w-full h-full text-th-text-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="3" x2="21" y2="21" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {activeTab === 'announcements' ? (
        <div className="bg-th-feed rounded-xl px-5 py-4">
          <AnnouncementBlock
            announcement={announcement}
            isLoading={announcementLoading}
            error={announcementError}
          />
        </div>
      ) : (
        <>
          <div className="bg-th-feed rounded-xl px-5 py-4 mb-3">
            <ShoutInput onShoutCreated={(shout) => { setShouts(prev => prev[0]?.isPinned ? [prev[0], shout, ...prev.slice(1)] : [shout, ...prev]); }} />
          </div>

          {isLoading && shouts.length === 0 && (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-th-border border-t-th-text-3 rounded-full animate-spin" />
            </div>
          )}

          {!isLoading && error && (
            <div className="text-center text-red-400 text-sm mb-4">
              {error}
              <button onClick={() => fetchShouts(shouts.length === 0)} className="ml-2 underline hover:text-red-300">Повторить</button>
            </div>
          )}

          {!isLoading && !error && shouts.length === 0 && (
            <div className="text-center text-th-text-4 text-sm py-8">
              {activeTab === 'popular' ? 'Нет популярных воплей за последние 7 дней' : 'Пока нет воплей. Будь первым'}
            </div>
          )}

          <div className="flex flex-col gap-3">
            {shouts.map((shout) => (
              <div
                key={shout.id}
                ref={(el) => {
                  if (el) shoutRefs.current.set(shout.id, el);
                  else shoutRefs.current.delete(shout.id);
                }}
                className="bg-th-feed rounded-xl px-5 py-4"
              >
                <ShoutCard
                  shout={shout}
                  showMedia={prefs.showMedia}
                  onCommentAdded={addCommentToShout}
                  onDelete={removeShout}
                  onCommentDeleted={removeComment}
                  onShoutEdited={editShout}
                  onCommentEdited={editComment}
                  isThreadOpen={openThreadId === shout.id}
                  onThreadToggle={handleThreadToggle}
                />
              </div>
            ))}
          </div>

          {/* Sentinel: IntersectionObserver watches this to trigger loading more */}
          <div ref={loaderRef} className="flex justify-center py-8 min-h-[1px]">
            {isLoadingMore && (
              <span className="w-5 h-5 border-2 border-th-border border-t-th-text-3 rounded-full animate-spin" />
            )}
            {!hasMore && shouts.length > 0 && !isLoading && (
              <span className="text-xs text-th-text-4">Всё загружено</span>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ShoutFeed;
