import { createContext, useContext, useEffect, useRef, useState, useMemo, useCallback, ReactNode } from "react";
import { Notification } from "../types";
import { useAuth } from "./AuthContext";
import { useSSEContext } from "./SSEContext";

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

    if (unreadCount > 0) {
      document.title = `(${unreadCount > 9 ? '9+' : unreadCount}) ${defaultTitle}`;

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
      document.title = defaultTitle;
      const link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
      if (link) link.href = defaultFaviconHref;
    }

    return () => {
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
