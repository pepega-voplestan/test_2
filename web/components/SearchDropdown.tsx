import React, { useState, useRef, useEffect, useCallback } from 'react';
import { navigateTo } from '../hooks/useRoute';

interface UserResult {
  id: string;
  name: string;
  avatar: string;
}

interface ShoutResult {
  id: string;
  content: string;
  visibilityTag: string;
  timestamp: string;
  user: {
    id: string;
    name: string;
    avatar: string;
    isBanned: boolean;
  };
}

const MagnifyIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" clipRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" />
  </svg>
);

const CloseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" clipRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" />
  </svg>
);

function getDeclension(count: number, one: string, few: string, many: string): string {
  const ld = count % 10, lt = count % 100;
  if (lt >= 11 && lt <= 19) return many;
  if (ld === 1) return one;
  if (ld >= 2 && ld <= 4) return few;
  return many;
}

function formatTimestamp(ts: string): string {
  try {
    const date = new Date(ts);
    if (isNaN(date.getTime())) return ts;
    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'только что';
    if (diffMin < 60) return `${diffMin} ${getDeclension(diffMin, 'минуту', 'минуты', 'минут')} назад`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours} ${getDeclension(diffHours, 'час', 'часа', 'часов')} назад`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} ${getDeclension(diffDays, 'день', 'дня', 'дней')} назад`;
  } catch { return ts; }
}

function renderExcerpt(content: string, query: string): React.ReactNode {
  const plain = content
    .replace(/@\[([^\]]+):[^\]]+\]/g, '@$1')
    .replace(/\|\|[\s\S]*?\|\|/g, '[***]');
  const q = query.trim();
  if (q.length < 2) {
    return plain.length > 120 ? plain.slice(0, 120) + '…' : plain;
  }
  const idx = plain.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) {
    return plain.length > 120 ? plain.slice(0, 120) + '…' : plain;
  }
  const start = Math.max(0, idx - 40);
  const end = Math.min(plain.length, idx + q.length + 80);
  return (
    <>
      {start > 0 ? '…' : ''}{plain.slice(start, idx)}<mark className="bg-yellow-400/30 text-th-text not-italic">{plain.slice(idx, idx + q.length)}</mark>{plain.slice(idx + q.length, end)}{end < plain.length ? '…' : ''}
    </>
  );
}

const SearchDropdown: React.FC = () => {
  const [focused, setFocused] = useState(false);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'users' | 'shouts'>('shouts');
  const [userFilter, setUserFilter] = useState<{ id: string; name: string } | null>(null);
  const [users, setUsers] = useState<UserResult[]>([]);
  const [shouts, setShouts] = useState<ShoutResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [inputFontSize, setInputFontSize] = useState('16px');

  useEffect(() => {
    // Fine pointer + hover = mouse-driven device (desktop/laptop); safe to use 14px.
    // Touch devices (iOS, Android) need 16px minimum to suppress Safari auto-zoom.
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    setInputFontSize(mq.matches ? '14px' : '16px');
  }, []);

  const pillRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close on outside click
  useEffect(() => {
    if (!focused) return;
    function handler(e: MouseEvent) {
      if (
        pillRef.current?.contains(e.target as Node) ||
        panelRef.current?.contains(e.target as Node)
      ) return;
      handleClose();
    }
    // Close on orientation change (width change); ignore height-only resize from virtual keyboard
    let prevWidth = window.innerWidth;
    const closeOnResize = () => {
      if (window.innerWidth !== prevWidth) {
        prevWidth = window.innerWidth;
        handleClose();
      }
    };
    document.addEventListener('mousedown', handler);
    window.addEventListener('resize', closeOnResize);
    return () => {
      document.removeEventListener('mousedown', handler);
      window.removeEventListener('resize', closeOnResize);
    };
  }, [focused]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape to close
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape' && focused) handleClose();
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [focused]); // eslint-disable-line react-hooks/exhaustive-deps

  const search = useCallback(async (q: string, t: 'users' | 'shouts', uf: { id: string } | null) => {
    if (q.trim().length < 2) {
      setUsers([]);
      setShouts([]);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ q: q.trim(), type: t });
      if (t === 'shouts' && uf) params.set('userId', uf.id);
      const res = await fetch(`/api/v1/search?${params}`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      if (t === 'users') setUsers(data.users ?? []);
      else setShouts(data.shouts ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query, tab, userFilter), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, tab, userFilter, search]);

  function handleFocus() {
    if (!pillRef.current) return;
    const rect = pillRef.current.getBoundingClientRect();
    const PANEL_W = 380;
    const PAD = 8;
    let right = window.innerWidth - rect.right;
    right = Math.max(PAD, right);
    if (window.innerWidth - right - PANEL_W < PAD) {
      right = window.innerWidth - PANEL_W - PAD;
    }
    // Panel position is anchored to where the icon button sat; panel width is fixed so right edge stays put
    setPanelStyle({ position: 'fixed', top: rect.bottom + 14, right: Math.min(right, window.innerWidth - PANEL_W - PAD) });
    setFocused(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleClose() {
    setFocused(false);
    setQuery('');
    setUsers([]);
    setShouts([]);
    setUserFilter(null);
    setTab('shouts');
    setActiveMenu(null);
    inputRef.current?.blur();
  }

  function switchTab(t: 'users' | 'shouts') {
    setTab(t);
    setUsers([]);
    setShouts([]);
    setActiveMenu(null);
  }

  function handleUserRowClick(u: UserResult) {
    setActiveMenu(prev => prev === u.id ? null : u.id);
  }

  function handleOpenProfile(u: UserResult) {
    navigateTo(`/profile/${u.id}`);
    handleClose();
  }

  function handleFilterByUser(u: UserResult) {
    setUserFilter({ id: u.id, name: u.name });
    setQuery('');
    switchTab('shouts');
  }

  function handleShoutClick(s: ShoutResult) {
    navigateTo(`/shout/${s.id}`);
    handleClose();
  }

  const trimmed = query.trim();

  return (
    <>
      <div ref={pillRef}>
      {!focused ? (
        /* Idle state: plain icon button, no pill */
        <button
          onClick={handleFocus}
          className="p-2 text-th-text-3 hover:text-th-text transition-colors"
          title="Поиск"
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <MagnifyIcon />
        </button>
      ) : (
        /* Active state: expanded pill with input */
        <div
          className="flex items-center rounded-full bg-th-input ring-1 ring-th-border w-36 sm:w-56"
          style={{ height: '36px' }}
        >
          <span className="shrink-0 flex items-center justify-center text-th-text-3 w-9">
            <MagnifyIcon />
          </span>

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Поиск..."
            className="flex-1 min-w-0 bg-transparent outline-none text-th-text"
            style={{ fontSize: inputFontSize }}
          />

          {query && (
            <button
              tabIndex={-1}
              onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              className="shrink-0 pr-2.5 text-th-text-3 hover:text-th-text transition-colors"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <CloseIcon />
            </button>
          )}
        </div>
      )}
      </div>

      {/* Results panel — fixed so it clears the sticky header correctly */}
      {focused && (
        <div
          ref={panelRef}
          style={panelStyle}
          className="w-[380px] max-w-[calc(100vw-1rem)] bg-th-card border border-th-border rounded-xl shadow-lg z-50 overflow-hidden"
        >
          {/* Tabs */}
          <div className="flex border-b border-th-border">
            {(['shouts', 'users'] as const).map(t => (
              <button
                key={t}
                onClick={() => switchTab(t)}
                className={[
                  'flex-1 py-2.5 text-xs font-semibold transition-colors',
                  tab === t
                    ? 'text-th-text border-b-2 border-th-text -mb-px'
                    : 'text-th-text-3',
                ].join(' ')}
              >
                {t === 'shouts' ? 'Вопли' : 'Пользователи'}
              </button>
            ))}
          </div>

          {/* User filter chip */}
          {tab === 'shouts' && userFilter && (
            <div className="px-3 py-2 border-b border-th-border-2 flex items-center gap-2">
              <span className="text-xs text-th-text-3 shrink-0">от</span>
              <span className="flex items-center gap-1.5 bg-th-input px-2 py-0.5 rounded-full text-xs text-th-text">
                @{userFilter.name}
                <button
                  onClick={() => setUserFilter(null)}
                  className="text-th-text-3 hover:text-th-text transition-colors"
                >
                  <CloseIcon />
                </button>
              </span>
            </div>
          )}

          {/* Results */}
          <div className="max-h-[420px] overflow-y-auto">
            {trimmed.length < 2 && (
              <div className="py-8 text-center text-sm text-th-text-3">
                Введите хотя бы 2 символа
              </div>
            )}

            {/* Spinner only when there's nothing to show yet */}
            {loading && trimmed.length >= 2 && tab === 'users' && users.length === 0 && (
              <div className="py-8 text-center text-sm text-th-text-3">Поиск...</div>
            )}
            {loading && trimmed.length >= 2 && tab === 'shouts' && shouts.length === 0 && (
              <div className="py-8 text-center text-sm text-th-text-3">Поиск...</div>
            )}

            {/* Users */}
            {!loading && tab === 'users' && trimmed.length >= 2 && users.length === 0 && (
              <div className="py-8 text-center text-sm text-th-text-3">Пользователи не найдены</div>
            )}
            {tab === 'users' && users.map(u => (
              <div key={u.id}>
                <div
                  onClick={() => handleUserRowClick(u)}
                  className={[
                    'flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors',
                    activeMenu === u.id ? 'bg-th-hover' : 'hover:bg-th-hover',
                  ].join(' ')}
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  <img
                    src={u.avatar}
                    alt={u.name}
                    className="w-8 h-8 rounded-full bg-th-input shrink-0"
                  />
                  <span className="flex-1 text-sm text-th-text font-medium truncate">{u.name}</span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg" width="14" height="14"
                    viewBox="0 0 20 20" fill="currentColor"
                    className={`text-th-text-3 shrink-0 transition-transform duration-150 ${activeMenu === u.id ? 'rotate-180' : ''}`}
                  >
                    <path fillRule="evenodd" clipRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                  </svg>
                </div>
                {activeMenu === u.id && (
                  <div className="border-t border-th-border-2">
                    <button
                      onClick={() => handleOpenProfile(u)}
                      className="w-full text-left px-6 py-2.5 text-sm text-th-text hover:bg-th-hover transition-colors"
                      style={{ WebkitTapHighlightColor: 'transparent' }}
                    >
                      Открыть профиль
                    </button>
                    <button
                      onClick={() => handleFilterByUser(u)}
                      className="w-full text-left px-6 py-2.5 text-sm text-th-text hover:bg-th-hover transition-colors border-t border-th-border-2"
                      style={{ WebkitTapHighlightColor: 'transparent' }}
                    >
                      Искать вопли от этого пользователя
                    </button>
                  </div>
                )}
              </div>
            ))}

            {/* Shouts */}
            {!loading && tab === 'shouts' && trimmed.length >= 2 && shouts.length === 0 && (
              <div className="py-8 text-center text-sm text-th-text-3">Вопли не найдены</div>
            )}
            {tab === 'shouts' && shouts.map(s => (
              <div
                key={s.id}
                onClick={() => handleShoutClick(s)}
                className="flex items-start gap-3 px-4 py-3 hover:bg-th-hover transition-colors cursor-pointer"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <a
                  href={`/profile/${s.user.id}`}
                  className="shrink-0 mt-0.5"
                  onClick={e => { e.stopPropagation(); navigateTo(`/profile/${s.user.id}`); handleClose(); e.preventDefault(); }}
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  <div className="w-7 h-7 rounded-full overflow-hidden bg-th-input hover:ring-2 hover:ring-th-border transition-all">
                    <img src={s.user.avatar} alt={s.user.name} className="w-full h-full object-cover" />
                  </div>
                </a>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <a
                      href={`/profile/${s.user.id}`}
                      className={`text-sm font-bold hover:underline ${s.user.isBanned ? 'text-th-text-4 line-through' : 'text-th-text-2'}`}
                      onClick={e => { e.stopPropagation(); navigateTo(`/profile/${s.user.id}`); handleClose(); e.preventDefault(); }}
                      style={{ WebkitTapHighlightColor: 'transparent' }}
                    >
                      {s.user.name}
                    </a>
                    <span className="text-xs text-th-text-4">{formatTimestamp(s.timestamp)}</span>
                  </div>
                  <div className="text-sm text-th-text leading-snug line-clamp-2 break-words">
                    {renderExcerpt(s.content, query)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

export default SearchDropdown;
