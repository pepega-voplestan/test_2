import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Comment, Shout } from '../types';
import { useAuth } from './AuthContext';
import { useIgnoredUsers } from './IgnoredUsersContext';
import { useSSE } from '../hooks/useSSE';
import {
  hasAttachment,
  previewText,
  sanitizeShoutPreviewText,
} from '../utils/commentFeedPreview';

export const COMMENT_FEED_BUFFER_MAX = 50;
export const COMMENT_FEED_HYDRATE_LIMIT = 40;
export const COMMENT_FEED_HYDRATE_MIN_INTERVAL_MS = 60_000;
export const COMMENT_FEED_MOBILE_MQ = '(max-width: 767px)';
export const COMMENT_FEED_SIDEBAR_WIDTH_PX = 340;

export type CommentFeedItem = {
  id: string;
  shoutId: string;
  userId: string;
  name: string;
  content: string;
  timestamp: string;
  hasMedia: boolean;
  shoutPreview: string;
  shoutHasMedia: boolean;
};

type ShoutMeta = {
  text: string;
  hasMedia: boolean;
};

type CommentFeedContextType = {
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  togglePanel: () => void;
  items: CommentFeedItem[];
  unseenWhileClosed: number;
  stickToTop: boolean;
  setStickToTop: (v: boolean) => void;
  revealedIgnoredIds: Set<string>;
  revealIgnored: (commentId: string) => void;
  isSoftHidden: (item: CommentFeedItem) => boolean;
  hydrateFromFeed: (opts?: { force?: boolean }) => Promise<boolean>;
  shoutMetaResolved: (shoutId: string) => boolean;
};

const CommentFeedContext = createContext<CommentFeedContextType | undefined>(undefined);

function sortNewestFirst(items: CommentFeedItem[]): CommentFeedItem[] {
  return items.slice().sort((a, b) => {
    const tb = Date.parse(b.timestamp) || 0;
    const ta = Date.parse(a.timestamp) || 0;
    if (tb !== ta) return tb - ta;
    return b.id.localeCompare(a.id);
  });
}

function itemFromComment(comment: Comment, shoutId: string, meta: ShoutMeta): CommentFeedItem | null {
  const id = String(comment.id || '');
  const sid = String(comment.shoutId || shoutId || '');
  if (!id || !sid) return null;
  return {
    id,
    shoutId: sid,
    userId: String(comment.user?.id || ''),
    name: String(comment.user?.name || '…'),
    content: String(comment.content || ''),
    timestamp: String(comment.timestamp || new Date().toISOString()),
    hasMedia: hasAttachment(comment.media, comment.gallery),
    shoutPreview: sanitizeShoutPreviewText(meta.text),
    shoutHasMedia: meta.hasMedia,
  };
}

export function CommentFeedProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { isIgnored, ignoredUserIds } = useIgnoredUsers();

  const [panelOpen, setPanelOpenState] = useState(false);
  const [items, setItems] = useState<CommentFeedItem[]>([]);
  const [unseenWhileClosed, setUnseenWhileClosed] = useState(0);
  const [stickToTop, setStickToTop] = useState(true);
  const [revealedIgnoredIds, setRevealedIgnoredIds] = useState<Set<string>>(() => new Set());
  const [shoutMetaVersion, setShoutMetaVersion] = useState(0);

  const shoutMetaRef = useRef<Map<string, ShoutMeta>>(new Map());
  const shoutMetaFetchedRef = useRef<Set<string>>(new Set());
  const lastHydrateAtRef = useRef(0);
  const hydrateInflightRef = useRef<Promise<boolean> | null>(null);
  const dirtyWhileHiddenRef = useRef(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const panelOpenRef = useRef(panelOpen);
  panelOpenRef.current = panelOpen;
  const prevIgnoredRef = useRef<string[]>([]);

  const rememberShoutMeta = useCallback((shoutId: string, meta: Partial<ShoutMeta>) => {
    const prev = shoutMetaRef.current.get(shoutId) || { text: '', hasMedia: false };
    const next: ShoutMeta = {
      text:
        meta.text !== undefined
          ? sanitizeShoutPreviewText(meta.text)
          : sanitizeShoutPreviewText(prev.text),
      hasMedia: meta.hasMedia !== undefined ? meta.hasMedia : prev.hasMedia,
    };
    shoutMetaRef.current.set(shoutId, next);
    setShoutMetaVersion((v) => v + 1);
    return next;
  }, []);

  const getShoutMeta = useCallback((shoutId: string): ShoutMeta => {
    return shoutMetaRef.current.get(shoutId) || { text: '', hasMedia: false };
  }, []);

  const shoutMetaResolved = useCallback((shoutId: string) => {
    return shoutMetaFetchedRef.current.has(shoutId);
  }, []);

  const applyMetaToItems = useCallback((shoutId: string) => {
    const meta = getShoutMeta(shoutId);
    setItems((prev) =>
      prev.map((item) => {
        if (item.shoutId !== shoutId) return item;
        return {
          ...item,
          shoutPreview: sanitizeShoutPreviewText(meta.text) || item.shoutPreview,
          shoutHasMedia: meta.hasMedia || item.shoutHasMedia,
        };
      }),
    );
  }, [getShoutMeta]);

  const setPanelOpen = useCallback((open: boolean) => {
    setPanelOpenState(open);
    document.documentElement.classList.toggle('comment-feed-open', open);
    if (open) {
      setUnseenWhileClosed(0);
      setStickToTop(true);
    }
  }, []);

  const togglePanel = useCallback(() => {
    setPanelOpen(!panelOpenRef.current);
  }, [setPanelOpen]);

  useEffect(() => {
    return () => {
      document.documentElement.classList.remove('comment-feed-open');
    };
  }, []);

  // Clear reveals when users newly enter the ignore list.
  useEffect(() => {
    const prev = new Set(prevIgnoredRef.current);
    const newly: string[] = [];
    for (const id of ignoredUserIds) {
      if (!prev.has(id)) newly.push(id);
    }
    prevIgnoredRef.current = ignoredUserIds;
    if (!newly.length) return;
    const newlySet = new Set(newly);
    setRevealedIgnoredIds((revealed) => {
      const next = new Set(revealed);
      for (const item of itemsRef.current) {
        if (newlySet.has(item.userId)) next.delete(item.id);
      }
      return next;
    });
  }, [ignoredUserIds]);

  const isSoftHidden = useCallback(
    (item: CommentFeedItem) => {
      if (!item.userId || !isIgnored(item.userId)) return false;
      return !revealedIgnoredIds.has(item.id);
    },
    [isIgnored, revealedIgnoredIds],
  );

  const revealIgnored = useCallback((commentId: string) => {
    setRevealedIgnoredIds((prev) => {
      const next = new Set(prev);
      next.add(commentId);
      return next;
    });
  }, []);

  const hydrateFromFeed = useCallback(async (opts: { force?: boolean } = {}): Promise<boolean> => {
    if (!user) return false;
    const force = Boolean(opts.force);
    const now = Date.now();
    if (!force && now - lastHydrateAtRef.current < COMMENT_FEED_HYDRATE_MIN_INTERVAL_MS) {
      return false;
    }

    if (hydrateInflightRef.current) {
      const prev = await hydrateInflightRef.current;
      if (!force) return Boolean(prev);
    }

    const run = (async (): Promise<boolean> => {
      const res = await fetch(
        `/api/v1/shouts?limit=${COMMENT_FEED_HYDRATE_LIMIT}&sortBy=new`,
        { credentials: 'include' },
      );
      if (!res.ok) return false;
      lastHydrateAtRef.current = Date.now();
      const data = await res.json();
      const shouts: Shout[] = Array.isArray(data?.shouts) ? data.shouts : [];

      const fromFeed: CommentFeedItem[] = [];
      for (const shout of shouts) {
        if (!shout?.id) continue;
        const meta = rememberShoutMeta(shout.id, {
          text: previewText(String(shout.content || '')),
          hasMedia: hasAttachment(shout.media, shout.gallery),
        });
        shoutMetaFetchedRef.current.add(shout.id);

        for (const raw of shout.comments || []) {
          const item = itemFromComment(raw, shout.id, meta);
          if (item) fromFeed.push(item);
        }
      }

      const newestFromFeed = sortNewestFirst(fromFeed).slice(0, COMMENT_FEED_BUFFER_MAX);
      // Functional setState so SSE rows that landed during fetch are not wiped
      // by a stale itemsRef snapshot (upsert-only merge invariant).
      let changed = false;
      setItems((prev) => {
        const byId = new Map<string, CommentFeedItem>();
        for (const item of prev) byId.set(item.id, item);

        for (const item of newestFromFeed) {
          const existing = byId.get(item.id);
          byId.set(
            item.id,
            existing
              ? {
                  ...existing,
                  ...item,
                  shoutPreview:
                    sanitizeShoutPreviewText(item.shoutPreview) ||
                    sanitizeShoutPreviewText(existing.shoutPreview),
                  shoutHasMedia: item.shoutHasMedia || existing.shoutHasMedia,
                  hasMedia: item.hasMedia || existing.hasMedia,
                }
              : item,
          );
        }

        for (const [id, item] of byId) {
          const meta = getShoutMeta(item.shoutId);
          byId.set(id, {
            ...item,
            shoutPreview:
              sanitizeShoutPreviewText(meta.text) ||
              sanitizeShoutPreviewText(item.shoutPreview),
            shoutHasMedia: meta.hasMedia || item.shoutHasMedia,
          });
        }

        const next = sortNewestFirst([...byId.values()]).slice(0, COMMENT_FEED_BUFFER_MAX);
        const fingerprint = (list: CommentFeedItem[]) =>
          JSON.stringify(
            list.map((x) => [
              x.id,
              x.content,
              x.timestamp,
              x.shoutPreview,
              x.shoutHasMedia,
              x.hasMedia,
            ]),
          );
        changed = fingerprint(prev) !== fingerprint(next);
        return next;
      });
      return changed;
    })()
      .catch((error) => {
        console.error('[comment-feed] hydrate failed', error);
        return false;
      })
      .finally(() => {
        hydrateInflightRef.current = null;
      });

    hydrateInflightRef.current = run;
    return Boolean(await run);
  }, [user, rememberShoutMeta, getShoutMeta]);

  // Cold hydrate when user signs in; clear on sign-out.
  useEffect(() => {
    if (!user) {
      setItems([]);
      setUnseenWhileClosed(0);
      setPanelOpen(false);
      shoutMetaRef.current.clear();
      shoutMetaFetchedRef.current.clear();
      lastHydrateAtRef.current = 0;
      return;
    }
    hydrateFromFeed({ force: true }).catch(() => {});
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hydrate when opening the panel (throttled).
  useEffect(() => {
    if (!panelOpen || !user) return;
    hydrateFromFeed().catch(() => {});
  }, [panelOpen, user, hydrateFromFeed]);

  const onNewComment = useCallback(
    (data: Record<string, unknown>) => {
      const comment =
        data.comment && typeof data.comment === 'object'
          ? (data.comment as Comment)
          : null;
      const shoutId = String(data.shoutId || comment?.shoutId || '');
      const commentId = String(data.commentId || comment?.id || '');
      if (!shoutId || !commentId || !comment) return;
      if (itemsRef.current.some((x) => x.id === commentId)) return;

      const meta = getShoutMeta(shoutId);
      const item = itemFromComment(comment, shoutId, meta);
      if (!item) return;

      setItems((prev) => sortNewestFirst([item, ...prev]).slice(0, COMMENT_FEED_BUFFER_MAX));
      if (!panelOpenRef.current) {
        setUnseenWhileClosed((n) => n + 1);
      }
      if (document.hidden) dirtyWhileHiddenRef.current = true;
    },
    [getShoutMeta],
  );

  const onEditComment = useCallback((data: Record<string, unknown>) => {
    const commentId = String(data.commentId || '');
    const content = typeof data.content === 'string' ? data.content : null;
    if (!commentId || content == null) return;
    setItems((prev) => {
      const idx = prev.findIndex((x) => x.id === commentId);
      if (idx === -1) return prev;
      const next = prev.slice();
      next[idx] = { ...next[idx], content };
      return next;
    });
    if (document.hidden) dirtyWhileHiddenRef.current = true;
  }, []);

  const onDeleteComment = useCallback((data: Record<string, unknown>) => {
    const commentId = String(data.commentId || '');
    if (!commentId) return;
    setItems((prev) => prev.filter((x) => x.id !== commentId));
    if (document.hidden) dirtyWhileHiddenRef.current = true;
  }, []);

  const onShoutMetaEvent = useCallback(
    (data: Record<string, unknown>, kind: 'new' | 'edit') => {
      const shout =
        data.shout && typeof data.shout === 'object' ? (data.shout as Shout) : null;
      const shoutId = String(data.shoutId || shout?.id || '');
      if (!shoutId) return;

      if (kind === 'edit' && typeof data.content === 'string') {
        rememberShoutMeta(shoutId, { text: previewText(data.content) });
        shoutMetaFetchedRef.current.add(shoutId);
        applyMetaToItems(shoutId);
        return;
      }
      if (!shout) return;
      rememberShoutMeta(shoutId, {
        text: previewText(String(shout.content || '')),
        hasMedia: hasAttachment(shout.media, shout.gallery),
      });
      shoutMetaFetchedRef.current.add(shoutId);
      applyMetaToItems(shoutId);
    },
    [rememberShoutMeta, applyMetaToItems],
  );

  const sseListeners = useMemo(
    () => ({
      new_comment: onNewComment,
      edit_comment: onEditComment,
      delete_comment: onDeleteComment,
      new_shout: (data: Record<string, unknown>) => onShoutMetaEvent(data, 'new'),
      edit_shout: (data: Record<string, unknown>) => onShoutMetaEvent(data, 'edit'),
    }),
    [onNewComment, onEditComment, onDeleteComment, onShoutMetaEvent],
  );

  useSSE(sseListeners);

  useEffect(() => {
    const resume = () => {
      if (document.hidden || !user) return;
      hydrateFromFeed().then((changed) => {
        const dirty = dirtyWhileHiddenRef.current;
        dirtyWhileHiddenRef.current = false;
        if (dirty || changed) {
          // Force a light re-render after background edits.
          setShoutMetaVersion((v) => v + 1);
        }
      });
    };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    return () => {
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', resume);
    };
  }, [user, hydrateFromFeed]);

  // Re-apply shout meta onto items when cache updates (version bump).
  void shoutMetaVersion;

  const value = useMemo<CommentFeedContextType>(
    () => ({
      panelOpen,
      setPanelOpen,
      togglePanel,
      items,
      unseenWhileClosed,
      stickToTop,
      setStickToTop,
      revealedIgnoredIds,
      revealIgnored,
      isSoftHidden,
      hydrateFromFeed,
      shoutMetaResolved,
    }),
    [
      panelOpen,
      setPanelOpen,
      togglePanel,
      items,
      unseenWhileClosed,
      stickToTop,
      revealedIgnoredIds,
      revealIgnored,
      isSoftHidden,
      hydrateFromFeed,
      shoutMetaResolved,
    ],
  );

  return (
    <CommentFeedContext.Provider value={value}>{children}</CommentFeedContext.Provider>
  );
}

export function useCommentFeed(): CommentFeedContextType {
  const ctx = useContext(CommentFeedContext);
  if (!ctx) throw new Error('useCommentFeed must be used within <CommentFeedProvider>');
  return ctx;
}
