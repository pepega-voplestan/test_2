import React, { useState, useEffect, useCallback, useRef } from 'react';
import ShoutInput from './ShoutInput';
import ShoutCard from './ShoutCard';
import { Shout, Comment } from '../types';

const PAGE_SIZE = 10;

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
  const [activeTab, setActiveTab] = useState<FeedTab>('new');
  const [showMedia, setShowMedia] = useState(true);

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

  const offsetRef = useRef(0);
  const activeTabRef = useRef(activeTab);

  // Keep ref in sync
  activeTabRef.current = activeTab;

  const fetchShouts = useCallback(async (reset = false) => {
    const currentOffset = reset ? 0 : offsetRef.current;
    const currentTab = activeTabRef.current;

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
      if (currentTab === 'popular') {
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

  const handleTabChange = (newTab: FeedTab) => {
    if (newTab === activeTab) return;
    setActiveTab(newTab);
    activeTabRef.current = newTab;
    setOpenThreadId(null);

    if (newTab === 'announcements') {
      fetchAnnouncement();
    } else {
      offsetRef.current = 0;
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
    setShouts(prev => prev.filter(s => s.id !== shoutId));
  }, []);

  // Accordion toggle: open clicked thread, close any previously open
  const handleThreadToggle = useCallback((shoutId: string) => {
    setOpenThreadId(prev => prev === shoutId ? null : shoutId);
  }, []);

  const isFeedTab = activeTab === 'new' || activeTab === 'popular';

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-th-text">Вопли</h1>

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

          {isFeedTab && (
            <button
              onClick={() => setShowMedia(!showMedia)}
              className={`p-1 transition-colors ${showMedia ? 'text-th-text' : 'text-th-text-4 hover:text-th-text-3'}`}
              title={showMedia ? 'Скрыть медиа' : 'Показать медиа'}
            >
              {'\uD83D\uDC41'}
            </button>
          )}
        </div>
      </div>

      {activeTab === 'announcements' ? (
        <AnnouncementBlock
          announcement={announcement}
          isLoading={announcementLoading}
          error={announcementError}
        />
      ) : (
        <>
          <ShoutInput onShoutCreated={() => { activeTabRef.current = activeTab; fetchShouts(true); }} />

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
                className="px-6 py-2 rounded-full border border-th-border text-th-text-3 hover:text-th-text hover:border-th-text-3 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoadingMore ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-th-border border-t-th-text-2 rounded-full animate-spin" />
                    Загрузка...
                  </span>
                ) : (
                  'Загрузить ещё'
                )}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ShoutFeed;
