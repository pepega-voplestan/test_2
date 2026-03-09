import { useEffect, useRef } from 'react';
import { useSSEContext } from '../context/SSEContext';

type SSEHandler = (data: Record<string, unknown>) => void;
type SSEListeners = Record<string, SSEHandler>;

/**
 * Subscribes to SSE events via the shared SSEContext connection.
 * Listeners object should be stable (wrap in useMemo or define outside render).
 */
export function useSSE(listeners: SSEListeners) {
  const { subscribe } = useSSEContext();
  const listenersRef = useRef(listeners);
  listenersRef.current = listeners;

  useEffect(() => {
    const eventTypes = Object.keys(listenersRef.current);
    const unsubscribers = eventTypes.map((event) =>
      subscribe(event, (data) => listenersRef.current[event]?.(data))
    );
    return () => unsubscribers.forEach((fn) => fn());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
