import { createContext, useContext, useEffect, useRef, useState, useMemo, useCallback, ReactNode } from "react";
import { Notification } from "../types";
import { useAuth } from "./AuthContext";
import { useSSEContext } from "./SSEContext";
import { notifDiag, describeUnread } from "../utils/notifDiag"; // TEMP DIAG

type NotificationsContextType = {
  sortedNotifications: Notification[];
  unreadCount: number;
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMore: () => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  flushReads: () => void;
};

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

const PAGE_SIZE = 20;
// Safety flush: if the dropdown stays open for a long time, don't hold reads indefinitely
const SAFETY_FLUSH_MS = 5000;

function dedupeById(items: Notification[]): Notification[] {
  const seen = new Set<string>();
  return items.filter(n => {
    if (seen.has(n.id)) return false;
    seen.add(n.id);
    return true;
  });
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const pendingReadIds = useRef<Set<string>>(new Set());
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function sendBatch(ids: string[]) {
    if (ids.length === 0) return;
    fetch("/api/v1/notifications/read-batch", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }).catch((err) => console.error("[Notifications] Failed to batch mark read:", err));
  }

  // Called when the dropdown closes — flushes everything accumulated during the session
  function flushReads() {
    if (safetyTimer.current) {
      clearTimeout(safetyTimer.current);
      safetyTimer.current = null;
    }
    const ids = [...pendingReadIds.current];
    pendingReadIds.current.clear();
    sendBatch(ids);
  }

  // Flush on unmount (e.g. user navigates away with dropdown open)
  useEffect(() => {
    return () => {
      if (safetyTimer.current) clearTimeout(safetyTimer.current);
      sendBatch([...pendingReadIds.current]);
    };
  }, []);

  // Fetch first page of notifications when user logs in
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setNextCursor(null);
      return;
    }
    fetch(`/api/v1/notifications?limit=${PAGE_SIZE}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.notifications)) {
          data.notifications.forEach((n: Notification) => notifDiag.origin.set(n.id, "server (first page)")); // TEMP DIAG
          setNotifications(data.notifications);
          setNextCursor(data.nextCursor ?? null);
        }
      })
      .catch((err) => console.error("[Notifications] Failed to fetch:", err));
  }, [user?.id]);

  // Load next page — called lazily by IntersectionObserver in the dropdown
  const loadMore = useCallback(() => {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    fetch(`/api/v1/notifications?cursor=${encodeURIComponent(nextCursor)}&limit=${PAGE_SIZE}`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.notifications)) {
          data.notifications.forEach((n: Notification) => { if (!notifDiag.origin.has(n.id)) notifDiag.origin.set(n.id, "server (older page)"); }); // TEMP DIAG
          setNotifications((prev) => dedupeById([...prev, ...data.notifications]));
          setNextCursor(data.nextCursor ?? null);
        }
      })
      .catch((err) => console.error("[Notifications] Failed to load more:", err))
      .finally(() => setIsLoadingMore(false));
  }, [nextCursor, isLoadingMore]);

  // Subscribe to notification events via the shared SSE connection
  const { subscribe } = useSSEContext();
  useEffect(() => {
    if (!user) return;
    return subscribe("notification", (raw) => {
      try {
        const data = raw as unknown as Notification;
        // TEMP DIAG: an id we have seen before means SSE is re-pushing it, and
        // dedupeById will keep this forced-unread copy over the held one.
        if (notifDiag.origin.has(data.id)) {
          notifDiag.redeliveries++;
          notifDiag.redeliveredIds.add(data.id);
        } else {
          notifDiag.origin.set(data.id, "SSE push");
        }
        // Prepend new notification, dedup in case of reconnect replay
        setNotifications((prev) => dedupeById([{ ...data, isRead: false }, ...prev]));
      } catch (err) {
        console.error("[Notifications] Failed to handle SSE notification:", err);
      }
    });
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function markAsRead(id: string) {
    // Optimistic update — the sort will move it to the read section
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
    pendingReadIds.current.add(id);
    if (!safetyTimer.current) {
      safetyTimer.current = setTimeout(flushReads, SAFETY_FLUSH_MS);
    }
  }

  function markAllAsRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    if (safetyTimer.current) {
      clearTimeout(safetyTimer.current);
      safetyTimer.current = null;
    }
    pendingReadIds.current.clear();
    fetch("/api/v1/notifications/read-all", {
      method: "PATCH",
      credentials: "include",
    }).catch((err) => console.error("[Notifications] Failed to mark all read:", err));
  }

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  // TEMP DIAG: one copy-pasteable block per badge change, naming exactly which
  // entries the badge counts, where each came from, and whether it is on screen.
  const lastLoggedCount = useRef<number | null>(null);
  useEffect(() => {
    if (lastLoggedCount.current === unreadCount) return;
    lastLoggedCount.current = unreadCount;
    const unread = notifications.filter((n) => !n.isRead);
    console.log(describeUnread(unread, notifications.length));
  }, [unreadCount, notifications]);

  // Sort: chronological, newest first
  const sortedNotifications = useMemo(() => {
    return [...notifications].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [notifications]);

  // Browser tab indicator: title prefix + favicon badge
  useEffect(() => {
    const defaultTitle = "Вопли";
    const defaultFaviconHref = "/favicon.svg";
    const wantedTitle =
      unreadCount > 0
        ? `(${unreadCount > 9 ? '9+' : unreadCount}) ${defaultTitle}`
        : defaultTitle;

    // The browser records the title per history entry and repaints the tab from
    // that record on back/forward, pushState entries included — so back from a
    // notification's shout restores the "(N)" that predates the read. Writing
    // the value we already hold cannot undo it: an unchanged title never reaches
    // the browser process, so the write has to actually move off it.
    function setTitle(next: string) {
      if (document.title === next) document.title = "";
      document.title = next;
    }

    if (unreadCount > 0) {
      setTitle(wantedTitle);

      const canvas = document.createElement("canvas");
      canvas.width = 32;
      canvas.height = 32;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, 32, 32);
          ctx.beginPath();
          ctx.arc(24, 8, 7, 0, 2 * Math.PI);
          ctx.fillStyle = "#ef4444";
          ctx.fill();
          ctx.strokeStyle = "#18181b";
          ctx.lineWidth = 2;
          ctx.stroke();

          const link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
          if (link) {
            link.href = canvas.toDataURL("image/png");
          }
        };
        img.src = defaultFaviconHref;
      }
    } else {
      setTitle(defaultTitle);
      const link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
      if (link) link.href = defaultFaviconHref;
    }

    // History navigation is the only point the tab can drift from unreadCount
    // (pageshow for a bfcache restore). The repaint can land after the handler,
    // hence the second pass a frame later.
    let raf = 0;
    const reassertTitle = () => {
      setTitle(wantedTitle);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setTitle(wantedTitle));
    };
    window.addEventListener("popstate", reassertTitle);
    window.addEventListener("pageshow", reassertTitle);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("popstate", reassertTitle);
      window.removeEventListener("pageshow", reassertTitle);
      document.title = defaultTitle;
      const link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
      if (link) link.href = defaultFaviconHref;
    };
  }, [unreadCount]);

  const value = useMemo<NotificationsContextType>(
    () => ({ sortedNotifications, unreadCount, hasMore: nextCursor !== null, isLoadingMore, loadMore, markAsRead, markAllAsRead, flushReads }),
    [sortedNotifications, unreadCount, nextCursor, isLoadingMore, loadMore]
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within <NotificationsProvider>");
  return ctx;
}
