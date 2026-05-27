import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useNotifications } from '../context/NotificationsContext';
import { Notification } from '../types';
import { navigateTo } from '../hooks/useRoute';
import { useScrollLock } from '../hooks/useScrollLock';

interface AnnouncementItem {
  id: string;
  title: string;
  releaseDate: string;
  content: string;
  createdAt: string;
}

const DOC_URL = 'https://docs.google.com/spreadsheets/d/1jwx6yVxiQ6-gD5DIFLHrUgzYVG1ESQXr9YTSg7BnhGA/edit?usp=sharing';

function formatRelativeTime(isoTimestamp: string): string {
  const now = Date.now();
  const then = new Date(isoTimestamp).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffH = Math.floor(diffMs / 3_600_000);
  const diffD = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return 'только что';
  if (diffMin < 60) return `${diffMin} мин назад`;
  if (diffH < 24) return `${diffH} ч назад`;
  if (diffD < 7) return `${diffD} д назад`;
  return new Date(isoTimestamp).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function notificationText(n: Notification): string {
  const name = n.actor.name;
  if (n.type === 'reply') return `${name} ответил на вашу запись`;
  if (n.commentId) return `${name} упомянул вас в комментарии`;
  return `${name} упомянул вас в записи`;
}

interface NotificationItemProps {
  notification: Notification;
  onClose: () => void;
}

const MARK_READ_DELAY_MS = 800;

const NotificationItem: React.FC<NotificationItemProps> = ({ notification: n, onClose }) => {
  const { markAsRead } = useNotifications();
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleMouseEnter() {
    if (!n.isRead) {
      hoverTimer.current = setTimeout(() => markAsRead(n.id), MARK_READ_DELAY_MS);
    }
  }

  function handleMouseLeave() {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  }

  function handleClick(e: React.MouseEvent) {
    markAsRead(n.id);
    if (e.button === 1 || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    if (n.shoutId) {
      const path = n.commentId
        ? `/shout/${n.shoutId}?comment=${n.commentId}`
        : `/shout/${n.shoutId}`;
      navigateTo(path);
    }
    onClose();
  }

  const href = n.shoutId
    ? n.commentId
      ? `/shout/${n.shoutId}?comment=${n.commentId}`
      : `/shout/${n.shoutId}`
    : '/';

  return (
    <a
      href={href}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      className={[
        'flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors duration-200 no-underline',
        n.isRead
          ? 'bg-th-card hover:bg-th-inset'
          : 'bg-th-input hover:bg-th-elevated',
      ].join(' ')}
    >
      <img
        src={n.actor.avatar}
        alt={n.actor.name}
        className="w-8 h-8 rounded-full flex-shrink-0 bg-th-input mt-0.5"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-th-text leading-snug">{notificationText(n)}</p>
        {n.snippet && (
          <p className="text-xs text-th-text-3 mt-1 truncate">«{n.snippet}»</p>
        )}
        <p className="text-xs text-th-text-3 mt-0.5">{formatRelativeTime(n.timestamp)}</p>
      </div>
      {/* Always rendered to avoid layout shift; invisible when read */}
      <div className={`w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1.5 transition-opacity ${n.isRead ? 'opacity-0' : 'opacity-100'}`} />
    </a>
  );
};

const DROPDOWN_W = 380;

const NotificationDropdown: React.FC = () => {
  const { sortedNotifications, unreadCount, hasMore, isLoadingMore, loadMore, markAllAsRead, flushReads } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<'notifications' | 'announcements'>('notifications');
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const [frozenList, setFrozenList] = useState(sortedNotifications);
  const frozenIds = useRef(new Set<string>());
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const [announcementItems, setAnnouncementItems] = useState<AnnouncementItem[]>([]);
  const [announcementLoading, setAnnouncementLoading] = useState(false);
  const [announcementError, setAnnouncementError] = useState<string | null>(null);
  const announcementFetched = useRef(false);

  useScrollLock(isOpen);

  // Snapshot the list on open; flush buffered reads on close
  useEffect(() => {
    if (isOpen) {
      setFrozenList(sortedNotifications);
      frozenIds.current = new Set(sortedNotifications.map((n) => n.id));
    } else {
      flushReads();
      setTab('notifications');
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // While open: update isRead in-place + append pages from loadMore
  useEffect(() => {
    if (!isOpen) return;
    const updatedMap = new Map(sortedNotifications.map((n) => [n.id, n]));
    const newItems = sortedNotifications.filter((n) => !frozenIds.current.has(n.id));
    newItems.forEach((n) => frozenIds.current.add(n.id));
    setFrozenList((prev) => {
      const patched = prev.map((item) => {
        const fresh = updatedMap.get(item.id);
        return fresh && fresh.isRead !== item.isRead ? { ...item, isRead: fresh.isRead } : item;
      });
      return newItems.length > 0 ? [...patched, ...newItems] : patched;
    });
  }, [isOpen, sortedNotifications]);

  // Fetch announcements when tab is opened for the first time
  useEffect(() => {
    if (tab !== 'announcements' || announcementFetched.current) return;
    announcementFetched.current = true;
    setAnnouncementLoading(true);
    fetch('/api/v1/announcements', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setAnnouncementItems(data.items || []))
      .catch(() => setAnnouncementError('Не удалось загрузить объявления'))
      .finally(() => setAnnouncementLoading(false));
  }, [tab]);

  // Close on outside click or viewport resize
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        buttonRef.current?.contains(e.target as Node) ||
        dropdownRef.current?.contains(e.target as Node)
      ) return;
      setIsOpen(false);
    };
    const closeOnResize = () => setIsOpen(false);
    document.addEventListener('mousedown', handler);
    window.addEventListener('resize', closeOnResize);
    return () => {
      document.removeEventListener('mousedown', handler);
      window.removeEventListener('resize', closeOnResize);
    };
  }, [isOpen]);

  // IntersectionObserver on sentinel
  useEffect(() => {
    if (!isOpen || !sentinelRef.current || !scrollRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          loadMore();
        }
      },
      { root: scrollRef.current, threshold: 0.1 }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [isOpen, hasMore, isLoadingMore, loadMore, frozenList.length]);

  function handleBellClick() {
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const PAD = 8;
      let right = window.innerWidth - rect.right;
      right = Math.max(PAD, right);
      if (window.innerWidth - right - DROPDOWN_W < PAD) {
        right = window.innerWidth - DROPDOWN_W - PAD;
      }
      setDropdownStyle({ position: 'fixed', top: rect.bottom + 14, right });
    }
    setIsOpen((o) => !o);
  }

  return (
    <div className="relative">
      {/* Bell button */}
      <button
        ref={buttonRef}
        onClick={handleBellClick}
        className="relative p-2 hover:text-th-text transition-colors"
        title="Уведомления"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zm0 16a2 2 0 01-2-2h4a2 2 0 01-2 2z" />
        </svg>

        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-0.5 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          ref={dropdownRef}
          style={dropdownStyle}
          className="w-[380px] max-w-[calc(100vw-1rem)] bg-th-card border border-th-border rounded-xl shadow-lg z-50 overflow-hidden"
        >
          {/* Tabs */}
          <div className="flex border-b border-th-border">
            {(['notifications', 'announcements'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={[
                  'flex-1 py-2.5 text-xs font-semibold transition-colors',
                  tab === t
                    ? 'text-th-text border-b-2 border-th-text -mb-px'
                    : 'text-th-text-3',
                ].join(' ')}
              >
                {t === 'notifications' ? 'Уведомления' : 'Объявления'}
              </button>
            ))}
          </div>

          {/* Mark all read strip */}
          {tab === 'notifications' && unreadCount > 0 && (
            <div className="px-4 py-1.5 border-b border-th-border-2 flex justify-end">
              <button
                onClick={markAllAsRead}
                className="text-xs text-blue-500 hover:text-blue-400 transition-colors"
              >
                Отметить все
              </button>
            </div>
          )}

          {/* Notifications tab */}
          {tab === 'notifications' && (
            frozenList.length === 0 ? (
              <div className="py-8 text-center text-sm text-th-text-3">
                Нет уведомлений
              </div>
            ) : (
              <div ref={scrollRef} className="max-h-[420px] overflow-y-auto divide-y divide-th-border-2">
                {frozenList.map((n) => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    onClose={() => setIsOpen(false)}
                  />
                ))}
                <div ref={sentinelRef} className="h-px" />
                {isLoadingMore && (
                  <div className="py-3 text-center text-xs text-th-text-3">
                    Загрузка...
                  </div>
                )}
              </div>
            )
          )}

          {/* Announcements tab */}
          {tab === 'announcements' && (
            <div className="max-h-[480px] overflow-y-auto">
              {/* Fixed header — Центральный документ */}
              <div className="px-4 pt-4 pb-3 border-b border-th-border-2">
                <div className="text-[10px] font-bold uppercase tracking-widest text-th-text-3 mb-1">Анонсы / Изменения</div>
                <p className="text-xs text-th-text-3 leading-snug">
                  <strong className="text-th-text font-medium">Центральный документ</strong> с багами, фичами и направлением:{' '}
                  <a
                    href={DOC_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#8fb4ff] hover:underline"
                  >
                    открыть таблицу
                  </a>
                </p>
              </div>

              {announcementLoading && (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-th-border border-t-th-text-3 rounded-full animate-spin" />
                </div>
              )}
              {!announcementLoading && announcementError && (
                <div className="py-8 text-center text-sm text-red-400">{announcementError}</div>
              )}
              {!announcementLoading && !announcementError && announcementItems.length === 0 && (
                <div className="py-8 text-center text-sm text-th-text-3">Нет объявлений</div>
              )}
              {!announcementLoading && announcementItems.map((item) => (
                <div key={item.id} className="px-4 py-4 border-b border-th-border-2 last:border-b-0">
                  <div className="inline-block bg-th-input text-th-text-3 border border-th-border rounded-full px-2 py-0.5 text-[10px] font-bold mb-2">
                    РЕЛИЗ — {item.releaseDate}
                  </div>
                  <h3 className="text-sm font-semibold text-th-text mb-2">{item.title}</h3>
                  <div className="text-xs text-th-text-2 leading-relaxed prose-announcement">
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                        strong: ({ children }) => <strong className="font-semibold text-th-text">{children}</strong>,
                        em: ({ children }) => <em className="italic">{children}</em>,
                        ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
                        li: ({ children }) => <li>{children}</li>,
                        code: ({ children }) => <code className="bg-th-input text-th-text-3 px-1 py-0.5 rounded text-[11px] font-mono">{children}</code>,
                        a: ({ href, children }) => (
                          <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#8fb4ff] hover:underline">
                            {children}
                          </a>
                        ),
                        h1: ({ children }) => <h1 className="text-sm font-bold text-th-text mt-3 mb-1">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-sm font-semibold text-th-text mt-3 mb-1">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-xs font-semibold text-th-text mt-2 mb-1">{children}</h3>,
                      }}
                    >
                      {item.content}
                    </ReactMarkdown>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationDropdown;
