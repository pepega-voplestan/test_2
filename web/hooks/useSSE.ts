import { useEffect, useRef } from 'react';

type SSEHandler = (data: Record<string, unknown>) => void;
type SSEListeners = Record<string, SSEHandler>;

/**
 * Connects to the SSE endpoint and dispatches events to the provided listeners.
 * Auto-reconnects with exponential backoff on error.
 * Listeners object should be stable (wrap in useMemo or define outside render).
 */
export function useSSE(listeners: SSEListeners) {
  const listenersRef = useRef(listeners);
  listenersRef.current = listeners;

  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let backoff = 1000;
    let unmounted = false;

    function connect() {
      if (unmounted) return;
      es = new EventSource('/api/v1/events');

      es.onopen = () => {
        console.log('[SSE] Connected');
        backoff = 1000;
      };

      es.onerror = () => {
        console.warn(`[SSE] Error, reconnecting in ${backoff}ms`);
        es?.close();
        if (!unmounted) {
          reconnectTimer = setTimeout(connect, backoff);
          backoff = Math.min(backoff * 2, 30000);
        }
      };

      // Listen for all known event types
      const eventTypes = [
        'new_shout', 'delete_shout',
        'new_comment', 'delete_comment',
        'shout_like', 'comment_like',
      ];

      for (const type of eventTypes) {
        es.addEventListener(type, (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            listenersRef.current[type]?.(data);
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
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, []);
}
