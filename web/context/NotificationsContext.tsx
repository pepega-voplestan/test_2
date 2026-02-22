import { createContext, useContext, useEffect, useRef, useState, useMemo, ReactNode } from "react";
import { Notification } from "../types";
import { useAuth } from "./AuthContext";

type NotificationsContextType = {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  flushReads: () => void;
};

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

// Safety flush: if the dropdown stays open for a long time, don't hold reads indefinitely
const SAFETY_FLUSH_MS = 5000;

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);

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

  // Fetch unread notifications when user logs in
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }
    fetch("/api/v1/notifications", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.notifications)) {
          setNotifications(data.notifications);
        }
      })
      .catch((err) => console.error("[Notifications] Failed to fetch:", err));
  }, [user?.id]);

  // SSE connection for incoming notification events
  useEffect(() => {
    if (!user) return;

    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let backoff = 1000;
    let unmounted = false;

    function connect() {
      if (unmounted) return;
      es = new EventSource("/api/v1/events");

      es.onopen = () => {
        backoff = 1000;
      };

      es.addEventListener("notification", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as Notification;
          setNotifications((prev) => [{ ...data, isRead: false }, ...prev]);
        } catch (err) {
          console.error("[Notifications] Failed to parse SSE event:", err);
        }
      });

      es.onerror = () => {
        es?.close();
        if (!unmounted) {
          timer = setTimeout(connect, backoff);
          backoff = Math.min(backoff * 2, 30_000);
        }
      };
    }

    connect();

    return () => {
      unmounted = true;
      es?.close();
      if (timer) clearTimeout(timer);
    };
  }, [user?.id]);

  function markAsRead(id: string) {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
    // Buffer for flush-on-close; also arm safety timer in case dropdown stays open
    pendingReadIds.current.add(id);
    if (!safetyTimer.current) {
      safetyTimer.current = setTimeout(flushReads, SAFETY_FLUSH_MS);
    }
  }

  function markAllAsRead() {
    // Optimistic update
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    // Discard buffered individual reads — read-all covers them
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

  const value = useMemo<NotificationsContextType>(
    () => ({ notifications, unreadCount, markAsRead, markAllAsRead, flushReads }),
    [notifications, unreadCount]
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
