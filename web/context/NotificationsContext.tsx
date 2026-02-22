import { createContext, useContext, useEffect, useState, useMemo, ReactNode } from "react";
import { Notification } from "../types";
import { useAuth } from "./AuthContext";

type NotificationsContextType = {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
};

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);

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
    // Persist in background
    fetch(`/api/v1/notifications/${id}/read`, {
      method: "PATCH",
      credentials: "include",
    }).catch((err) => console.error("[Notifications] Failed to mark read:", err));
  }

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const value = useMemo<NotificationsContextType>(
    () => ({ notifications, unreadCount, markAsRead }),
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
