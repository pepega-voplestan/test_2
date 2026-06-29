import { createContext, useContext, useEffect, useMemo, useRef, ReactNode } from "react";
import { useAuth } from "./AuthContext";

type SSEHandler = (data: Record<string, unknown>) => void;

interface SSEContextType {
  subscribe: (event: string, handler: SSEHandler) => () => void;
}

const SSEContext = createContext<SSEContextType | null>(null);

const ALL_EVENTS = [
  "new_shout", "delete_shout",
  "new_comment", "delete_comment",
  "shout_like", "comment_like",
  "notification",
  "poll_update",
  "pin_shout", "unpin_shout",
  "edit_shout", "edit_comment",
];

export function SSEProvider({ children }: { children: ReactNode }) {
  const handlersRef = useRef<Map<string, Set<SSEHandler>>>(new Map());
  const { user, loading } = useAuth();

  function subscribe(event: string, handler: SSEHandler): () => void {
    if (!handlersRef.current.has(event)) {
      handlersRef.current.set(event, new Set());
    }
    handlersRef.current.get(event)!.add(handler);
    return () => { handlersRef.current.get(event)?.delete(handler); };
  }

  // Open the realtime channel only for authenticated users. Anonymous visitors
  // establish no EventSource at all; signing in opens it and signing out tears
  // it down (re-running on the user id change). Authorization is also enforced
  // authoritatively on the server — this is the client-side counterpart.
  useEffect(() => {
    if (loading || !user) return;

    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let backoff = 1000;
    let unmounted = false;

    function connect() {
      if (unmounted) return;
      es = new EventSource("/api/v1/events");

      es.onopen = () => { backoff = 1000; };

      es.onerror = () => {
        es?.close();
        if (!unmounted) {
          timer = setTimeout(connect, backoff);
          backoff = Math.min(backoff * 2, 30_000);
        }
      };

      for (const type of ALL_EVENTS) {
        es.addEventListener(type, (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            handlersRef.current.get(type)?.forEach((h) => h(data));
          } catch (err) {
            console.error(`[SSE] Failed to parse ${type}:`, err);
          }
        });
      }
    }

    connect();

    return () => {
      unmounted = true;
      es?.close();
      if (timer) clearTimeout(timer);
    };
  }, [user?.id, loading]);

  const value = useMemo<SSEContextType>(() => ({ subscribe }), []); // eslint-disable-line react-hooks/exhaustive-deps

  return <SSEContext.Provider value={value}>{children}</SSEContext.Provider>;
}

export function useSSEContext(): SSEContextType {
  const ctx = useContext(SSEContext);
  if (!ctx) throw new Error("useSSEContext must be used within <SSEProvider>");
  return ctx;
}
