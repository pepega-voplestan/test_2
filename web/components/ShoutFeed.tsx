import React, { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react';
import ShoutInput from './ShoutInput';
import ShoutCard from './ShoutCard';
import { Shout, Comment } from '../types';
import { useAuth } from '../context/AuthContext';
import { useContentPreferences } from '../context/ContentPreferencesContext';
import { useSSE } from '../hooks/useSSE';

const PAGE_SIZE = 25;

// How many pages (of PAGE_SIZE) the restore effect will load while searching
// for a remembered anchor shout before giving up and falling back to a
// fresh-load landing. Bounds worst-case restore cost; a tuning constant, not
// a product decision (spec.md Assumptions).
const ANCHOR_SEARCH_LIMIT_PAGES = 8;
// Rough single-card height, used only to size the initial (pre-render)
// placeholder/scroll estimate — never for correctness. See SavedFeedAnchor's
// approxItemsAbove field.
const AVERAGE_CARD_HEIGHT_ESTIMATE_PX = 150;

// sessionStorage key for the saved scroll-restore anchor, written when the
// feed unmounts and consumed once on next mount. Exported so App.tsx can
// skip its own scroll-to-top reset while a restore is pending, avoiding a
// flash-to-top-then-jump-back-down.
export const FEED_SCROLL_STORAGE_KEY = 'feedScrollState';

// Identity-based restore anchor: which shout was at the top of the feed, and
// how far into it the reader had scrolled — NOT a raw pixel offset, so
// restoration stays correct even when new shouts appear above it while the
// reader is away (see specs/009-anchor-scroll-restore). Replaces the earlier
// pixel-offset SavedFeedState shape.
interface SavedFeedAnchor {
  kind: 'anchor';
  shoutId: string;
  // Pixels between the anchor shout's top edge and the viewport's top edge
  // at save time. <= 0 in the normal case (the reader has scrolled at or
  // past this shout); > 0 only when the reader hadn't scrolled past even the
  // first rendered shout yet.
  offsetFromTop: number;
  // How many shouts were loaded above the anchor at save time. Used ONLY to
  // size the initial placeholder/scroll estimate before any data has
  // (re)loaded — never to locate the anchor or gate the restore loop, which
  // searches by shoutId alone. A stale value here only means a larger
  // correction jump once the real anchor renders, never a wrong final
  // position.
  approxItemsAbove: number;
  activeTab: FeedTab;
  popularSort: 'likes' | 'comments';
}

// Reads a pending scroll-restore entry synchronously, for useState's lazy
// initializer — needs to be available on the very FIRST render (not a
// useEffect, which only runs after that first render has already painted),
// so the reserved-height placeholder and the immediate scroll-to (both
// driven by this) are both in place before the reader ever sees a frame.
// Reading it here only — not clearing it — the restore effect below owns
// clearing it once the restore actually completes. Anything that isn't a
// well-formed SavedFeedAnchor — including an entry saved by the prior
// pixel-offset version, which has no `kind` field — is treated as nothing to
// restore, not an error.
function readPendingRestore(): SavedFeedAnchor | null {
  const raw = sessionStorage.getItem(FEED_SCROLL_STORAGE_KEY);
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && parsed.kind === 'anchor' && typeof parsed.shoutId === 'string') {
      return parsed as SavedFeedAnchor;
    }
    return null;
  } catch {
    return null;
  }
}

// Waits for the anchor shout's DOM node to actually be rendered (shoutRefs
// is populated by ref callbacks during commit, which lands slightly after
// the state update that added the shout to `shouts`), then scrolls so its
// top edge lands at `offsetFromTop` — the only way to get the real position,
// since it depends on the rendered height of everything above it. Gives up
// at `deadline` regardless (a slow/failed render never hangs this forever).
function scrollToAnchorWhenRendered(
  shoutRefs: Map<string, HTMLDivElement>,
  shoutId: string,
  offsetFromTop: number,
  deadline: number
) {
  const el = shoutRefs.get(shoutId);
  if (el) {
    window.scrollBy(0, el.getBoundingClientRect().top - offsetFromTop);
    return;
  }
  if (Date.now() >= deadline) return;
  requestAnimationFrame(() => scrollToAnchorWhenRendered(shoutRefs, shoutId, offsetFromTop, deadline));
}

const QUOTE_MAX_LEN = 150;
function clientSnippet(content: string): string {
  const trimmed = content.replace(/^(@\[[^\]]+:[^\]]+\]\s*)+/, '');
  const masked = (trimmed || content).replace(/\|\|(.+?)\|\|/gs, (_: string, inner: string) => '*'.repeat(inner.replace(/@\[([^\]:]+):[^\]]+\]/g, '@$1').length));
  const stripped = masked.replace(/@\[([^\]:]+):[^\]]+\]/g, '@$1').replace(/\s+/g, ' ').trim();
  return stripped.length > QUOTE_MAX_LEN ? stripped.slice(0, QUOTE_MAX_LEN) + '…' : stripped;
}

type FeedTab = 'new' | 'popular';

const ShoutFeed: React.FC = () => {
  const { user } = useAuth();
  const { prefs, setShowMedia } = useContentPreferences();
  // Computed once, synchronously, on the very first render — needs to be
  // available immediately (not discovered later in a useEffect) so the tab/
  // sort start correct from frame one, and so the reserved-height
  // placeholder + immediate scroll-to below (both driven by this) are
  // already in place before the reader ever sees a frame. Doing any of this
  // a tick later, after an empty feed has already painted, is what caused
  // the visible flash-to-top-then-jump-back-down.
  const [restoreState] = useState<SavedFeedAnchor | null>(readPendingRestore);
  // Flips to false once the restore (paging + reveal) finishes; while true,
  // the placeholder below stands in for the real content.
  const [restoring, setRestoring] = useState(!!restoreState);
  // Set once the restore's search loop resolves — whether the anchor shout
  // was actually found (vs. the search-limit fallback). Read by the
  // post-reveal correction effect below to decide between "scroll to the
  // anchor's exact position" and "land at top, like a fresh visit."
  const anchorFoundRef = useRef(false);
  const [activeTab, setActiveTab] = useState<FeedTab>(restoreState?.activeTab ?? 'new');
  type PopularSort = 'likes' | 'comments';
  const [popularSort, setPopularSort] = useState<PopularSort>(restoreState?.popularSort ?? 'likes');
  const popularSortRef = useRef<PopularSort>(restoreState?.popularSort ?? 'likes');

  const [shouts, setShouts] = useState<Shout[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const shoutsCountRef = useRef(0);
  shoutsCountRef.current = shouts.length;
  // Mirrors `shouts` for the unmount-save effect below — plain React state,
  // not a DOM measurement, so (unlike liveAnchorRef) it's safe to read
  // directly at unmount time; no live-tracking needed for this one.
  const shoutsRef = useRef<Shout[]>([]);
  shoutsRef.current = shouts;

  // Accordion: only one thread open at a time
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);

  // Scroll-anchor: prevents viewport jump when closing one thread opens another
  const shoutRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const scrollAnchorRef = useRef<{ id: string; top: number } | null>(null);

  // Tracks the live scroll position AND which shout is currently anchoring
  // the top of the viewport, while mounted — read by the unmount-save effect
  // below INSTEAD OF measuring anything reactively at that point. By the
  // time a React effect cleanup runs on unmount, the DOM has already been
  // mutated (this component's content already removed) — browsers clamp
  // window.scrollY immediately once the page's scrollable content shrinks,
  // as part of that same DOM change, well before any JS cleanup gets a
  // chance to run, and any element measured at that point reads back a
  // detached/zeroed rect. Both refs below exist to have already captured the
  // real values before that happens.
  const liveScrollYRef = useRef(0);
  const liveAnchorRef = useRef<{ shoutId: string; offsetFromTop: number } | null>(null);
  useEffect(() => {
    liveScrollYRef.current = window.scrollY;

    let rafId: number | null = null;
    const recomputeAnchor = () => {
      rafId = null;
      // Select by MAX measured top among those <= 0 (rather than by
      // shoutRefs' Map iteration/insertion order): Map iteration order is
      // insertion order, which drifts from visual top-to-bottom order the
      // moment a shout is prepended (e.g. a live SSE new_shout) — its key is
      // newly inserted at the END of the Map's iteration order despite
      // rendering at the visual TOP. Measuring is order-independent.
      let atOrPastTop: { shoutId: string; offsetFromTop: number } | null = null;
      let topmostOverall: { shoutId: string; offsetFromTop: number } | null = null;
      for (const [id, el] of shoutRefs.current) {
        const top = el.getBoundingClientRect().top;
        if (top <= 0 && (atOrPastTop === null || top > atOrPastTop.offsetFromTop)) {
          atOrPastTop = { shoutId: id, offsetFromTop: top };
        }
        if (topmostOverall === null || top < topmostOverall.offsetFromTop) {
          topmostOverall = { shoutId: id, offsetFromTop: top };
        }
      }
      // Fall back to the physically topmost rendered shout if none has been
      // scrolled to/past yet (feed near the very top).
      liveAnchorRef.current = atOrPastTop ?? topmostOverall;
    };
    recomputeAnchor();

    const onScroll = () => {
      liveScrollYRef.current = window.scrollY;
      if (rafId === null) rafId = requestAnimationFrame(recomputeAnchor);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

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

  const fetchShoutsRef = useRef<(reset?: boolean) => Promise<{ hasMore: boolean; added: number; shouts: Shout[] }>>(
    async () => ({ hasMore: false, added: 0, shouts: [] })
  );

  // Resolves with what this call actually loaded (not just void) so the
  // scroll-restore effect below can drive its own paging loop without
  // depending on React state having re-rendered yet. `shouts` is just this
  // page's fetched items — lets the restore loop search for the anchor's ID
  // directly, without waiting on (or depending on the timing of) the
  // `shouts` state update this same call also triggers via setShouts.
  const fetchShouts = useCallback(async (reset = false): Promise<{ hasMore: boolean; added: number; shouts: Shout[] }> => {
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
      return { hasMore: !!data.hasMore, added: data.shouts.length as number, shouts: data.shouts as Shout[] };
    } catch (err) {
      console.error('[ShoutFeed] Fetch error:', err);
      setError('Не удалось загрузить вопли. Попробуй ещё раз.');
      return { hasMore: false, added: 0, shouts: [] };
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, []);
  fetchShoutsRef.current = fetchShouts;

  // Scrolls to an ESTIMATED position immediately, before the first paint —
  // approxItemsAbove comes from the saved anchor itself, so it's available
  // synchronously (unlike "how many items are loaded so far," which is
  // always zero at this point, before any fetch has even started — an
  // earlier version of this used that and always collapsed to just
  // window.innerHeight, silently discarding how deep the reader actually
  // was). This estimate is a UX nicety only: it seeds where the placeholder
  // lands, nothing more — see the correction effect below for the real
  // position, and SavedFeedAnchor's approxItemsAbove field for why this
  // never affects correctness.
  useLayoutEffect(() => {
    if (restoreState) {
      window.scrollTo(0, restoreState.approxItemsAbove * AVERAGE_CARD_HEIGHT_ESTIMATE_PX + window.innerHeight);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initial load — restores the reader's previous position by identity if
  // they're returning to the feed (e.g. via "Назад" from a shout), otherwise
  // loads the first page fresh. The saved entry (written by the unmount
  // effect below) is single-use, but is deliberately NOT cleared until the
  // restore finishes (see below) — App.tsx's own route-change effect (a
  // *parent* effect, which React always runs after this *child* one in the
  // same commit) checks for this same entry to decide whether to skip its
  // default scroll-to-top; clearing it here up front would make that check
  // always see it as already gone.
  useEffect(() => {
    if (!restoreState) {
      sessionStorage.removeItem(FEED_SCROLL_STORAGE_KEY);
      fetchShouts(true);
      return;
    }

    // activeTab/popularSort (and their refs) are already seeded from
    // restoreState above — nothing more to set here before paging.
    (async () => {
      let pagesLoaded = 0;
      let { hasMore: more, shouts: pageItems } = await fetchShouts(true);
      pagesLoaded++;
      let found = pageItems.some(s => s.id === restoreState.shoutId);
      // Search by identity, not by count: new shouts ahead of the anchor
      // must not throw this off (FR-004). Bounded by ANCHOR_SEARCH_LIMIT_PAGES
      // so a deleted or very-deep anchor can't page indefinitely (FR-006).
      while (!found && more && pagesLoaded < ANCHOR_SEARCH_LIMIT_PAGES) {
        ({ hasMore: more, shouts: pageItems } = await fetchShouts(false));
        pagesLoaded++;
        found = pageItems.some(s => s.id === restoreState.shoutId);
      }
      sessionStorage.removeItem(FEED_SCROLL_STORAGE_KEY);
      anchorFoundRef.current = found;
      setRestoring(false); // swaps the placeholder for the now-fully-loaded real content
    })();
    // fetchShouts is stable (useCallback with no deps); this should only
    // ever run once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once the placeholder is swapped for real content (shoutRefs only gets
  // populated once ShoutCards actually render, which only happens once
  // `restoring` is false — this must run AFTER that swap, not alongside it):
  // if the anchor was found, wait for its real DOM node and correct to its
  // exact position, since the pre-render estimate above can only ever be
  // approximate. If it wasn't found (deleted, or beyond the search limit),
  // land at the top — same as a fresh visit, not at the now-meaningless
  // estimated position (FR-006).
  useLayoutEffect(() => {
    if (restoring || !restoreState) return;
    if (anchorFoundRef.current) {
      scrollToAnchorWhenRendered(shoutRefs.current, restoreState.shoutId, restoreState.offsetFromTop, Date.now() + 2000);
    } else {
      window.scrollTo(0, 0);
    }
  }, [restoring]);

  // Saves the reader's current position (which shout is at the top, and how
  // far into it) whenever the feed unmounts (e.g. navigating into a shout) —
  // see the restore effects above. Reads liveAnchorRef/shoutsRef, NOT
  // anything measured or read reactively here — see liveAnchorRef's own
  // comment for why that would be too late.
  useEffect(() => {
    return () => {
      const anchor = liveAnchorRef.current;
      if (!anchor) return; // nothing rendered yet (e.g. feed still empty) — nothing to restore to
      const approxItemsAbove = Math.max(0, shoutsRef.current.findIndex(s => s.id === anchor.shoutId));
      const saved: SavedFeedAnchor = {
        kind: 'anchor',
        shoutId: anchor.shoutId,
        offsetFromTop: anchor.offsetFromTop,
        approxItemsAbove,
        activeTab: activeTabRef.current,
        popularSort: popularSortRef.current,
      };
      sessionStorage.setItem(FEED_SCROLL_STORAGE_KEY, JSON.stringify(saved));
    };
  }, []);

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

    fetchShouts(true);
  };

  const handlePopularSortChange = (sort: PopularSort) => {
    if (sort === popularSort) return;
    setPopularSort(sort);
    popularSortRef.current = sort;
    setOpenThreadId(null);
    fetchShouts(true);
  };

  // Clicking the tab while it's already active toggles the sort (likes ↔
  // comments) instead of being a no-op — a shortcut alongside the pill above it.
  const handlePopularTabClick = () => {
    if (activeTab === 'popular') {
      handlePopularSortChange(popularSort === 'likes' ? 'comments' : 'likes');
      return;
    }
    handleTabChange('popular');
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
    const deletedQuote = { text: 'Комментарий удалён', deleted: true, author: null };
    setShouts(prev =>
      prev.map(s =>
        s.id === shoutId
          ? {
              ...s,
              comments: (s.comments || [])
                .filter(c => c.id !== commentId)
                .map(c => c.replyToId === commentId ? { ...c, quote: deletedQuote } : c),
            }
          : s
      )
    );
  }, []);

  const removeShout = useCallback((shoutId: string) => {
    setShouts(prev => {
      const target = prev.find(s => s.id === shoutId);
      if (target && (target.comments || []).length === 0) {
        return prev.filter(s => s.id !== shoutId);
      }
      return prev.map(s =>
        s.id === shoutId ? { ...s, isDeleted: true, content: '', media: undefined, user: null } : s
      );
    });
  }, []);

  const editShout = useCallback((shoutId: string, newContent: string) => {
    setShouts(prev => prev.map(s => s.id === shoutId ? { ...s, content: newContent } : s));
  }, []);

  const editComment = useCallback((shoutId: string, commentId: string, newContent: string) => {
    const newSnippet = clientSnippet(newContent);
    setShouts(prev => prev.map(s => s.id === shoutId ? {
      ...s,
      comments: (s.comments || []).map(c => {
        if (c.id === commentId) return { ...c, content: newContent };
        if (c.replyToId === commentId && c.quote && !c.quote.deleted) return { ...c, quote: { ...c.quote, text: newSnippet } };
        return c;
      }),
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
    remove_shout: (data: Record<string, unknown>) => {
      if (data.userId === userIdRef.current) return;
      const shoutId = data.shoutId as string;
      setShouts(prev => prev.filter(s => s.id !== shoutId));
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
      const deletedQuote = { text: 'Комментарий удалён', deleted: true, author: null };
      setShouts(prev => prev.map(s =>
        s.id === shoutId
          ? {
              ...s,
              comments: (s.comments || [])
                .filter(c => c.id !== commentId)
                .map(c => c.replyToId === commentId ? { ...c, quote: deletedQuote } : c),
            }
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
      const newSnippet = clientSnippet(content);
      setShouts(prev => prev.map(s => s.id === shoutId ? {
        ...s,
        comments: (s.comments || []).map(c => {
          if (c.id === commentId) return { ...c, content };
          if (c.replyToId === commentId && c.quote && !c.quote.deleted) return { ...c, quote: { ...c.quote, text: newSnippet } };
          return c;
        }),
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
                onClick={handlePopularTabClick}
                title={activeTab === 'popular' ? 'Нажмите, чтобы переключить сортировку' : undefined}
                className={`px-3 py-1 text-sm font-medium rounded shadow-sm transition-all ${
                  activeTab === 'popular' ? 'bg-th-elevated text-th-text' : 'text-th-text-3 hover:text-th-text'
                }`}
              >
                Популярные
              </button>
            </div>
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

      <div className="bg-th-feed rounded-xl px-5 py-4 mb-3">
            <ShoutInput onShoutCreated={(shout) => { setShouts(prev => prev[0]?.isPinned ? [prev[0], shout, ...prev.slice(1)] : [shout, ...prev]); }} />
          </div>

          {restoring && restoreState ? (
            // Stands in for the whole content block below while paging back
            // up to the reader's previous position (see the mount/restore
            // effects above) — reserves at least as much height as the
            // estimated scroll target so the immediate scroll-to lands
            // correctly instead of being clamped by an as-yet-too-short
            // page, and avoids a flash of the (wrong-tab, empty) default
            // state. Same estimate formula as the immediate scrollTo effect.
            <div
              data-testid="scroll-restore-placeholder"
              style={{ minHeight: restoreState.approxItemsAbove * AVERAGE_CARD_HEIGHT_ESTIMATE_PX + window.innerHeight }}
              className="flex justify-center pt-8"
            >
              <div className="w-6 h-6 border-2 border-th-border border-t-th-text-3 rounded-full animate-spin" />
            </div>
          ) : (
            <>
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
