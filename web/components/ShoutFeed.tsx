import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
      <div className="text-th-text whitespace-pre-wrap break-words">{announcement.content}</div>
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
  const { prefs, setShowMedia, setShowNsfw, setShowPolitics } = useContentPreferences();
  const [activeTab, setActiveTab] = useState<FeedTab>('new');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  // Close settings dropdown on outside click
  useEffect(() => {
    if (!settingsOpen) return;
    const handler = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [settingsOpen]);

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

  // Accordion toggle: open clicked thread, close any previously open
  const handleThreadToggle = useCallback((shoutId: string) => {
    setOpenThreadId(prev => prev === shoutId ? null : shoutId);
  }, []);

  // --- SSE real-time updates ---
  const sseListeners = useMemo(() => ({
    new_shout: (data: Record<string, unknown>) => {
      if (data.userId === userIdRef.current) return;
      if (activeTabRef.current !== 'new') return;
      const shout = data.shout as Shout | undefined;
      if (shout) {
        setShouts(prev => [shout, ...prev]);
      }
    },
    delete_shout: (data: Record<string, unknown>) => {
      if (data.userId === userIdRef.current) return;
      const shoutId = data.shoutId as string;
      setShouts(prev => prev.map(s =>
        s.id === shoutId ? { ...s, isDeleted: true, content: '', media: undefined, user: null } : s
      ));
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
            <button
              onClick={() => handleTabChange('popular')}
              className={`px-3 py-1 text-sm font-medium rounded shadow-sm transition-all ${
                activeTab === 'popular' ? 'bg-th-elevated text-th-text' : 'text-th-text-3 hover:text-th-text'
              }`}
            >
              Популярные
            </button>
            <button
              onClick={() => handleTabChange('announcements')}
              className={`px-3 py-1 text-sm font-medium rounded shadow-sm transition-all ${
                activeTab === 'announcements' ? 'bg-th-elevated text-th-text' : 'text-th-text-3 hover:text-th-text'
              }`}
            >
              Объявления
            </button>
          </div>

          <div className="relative" ref={settingsRef}>
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              className={`p-1.5 transition-colors ${settingsOpen ? 'text-th-text' : 'text-th-text-4 hover:text-th-text-3'}`}
              title="Настройки контента"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
            {settingsOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-th-card border border-th-border rounded-lg shadow-xl z-40 py-2">
                <div className="px-3 py-1.5 text-[10px] font-bold text-th-text-4 uppercase tracking-wider">Отображение</div>
                <label className="flex items-center gap-3 px-3 py-2 hover:bg-th-elevated/50 cursor-pointer transition-colors">
                  <input type="checkbox" checked={prefs.showMedia} onChange={(e) => setShowMedia(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-th-border accent-[#0087ff]" />
                  <span className="text-sm text-th-text-2">Медиа</span>
                </label>
                <label className="flex items-center gap-3 px-3 py-2 hover:bg-th-elevated/50 cursor-pointer transition-colors">
                  <input type="checkbox" checked={prefs.showNsfw} onChange={(e) => setShowNsfw(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-th-border accent-red-500" />
                  <span className="text-sm text-th-text-2">NSFW <span className="text-th-text-4 text-xs">(18+)</span></span>
                </label>
                <label className="flex items-center gap-3 px-3 py-2 hover:bg-th-elevated/50 cursor-pointer transition-colors">
                  <input type="checkbox" checked={prefs.showPolitics} onChange={(e) => setShowPolitics(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-th-border accent-blue-500" />
                  <span className="text-sm text-th-text-2">Политика</span>
                </label>
              </div>
            )}
          </div>
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
            <ShoutInput onShoutCreated={(shout) => { setShouts(prev => [shout, ...prev]); }} />
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
                className="bg-th-feed rounded-xl px-5 py-4"
              >
                <ShoutCard
                  shout={shout}
                  showMedia={prefs.showMedia}
                  onCommentAdded={addCommentToShout}
                  onDelete={removeShout}
                  onCommentDeleted={removeComment}
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
