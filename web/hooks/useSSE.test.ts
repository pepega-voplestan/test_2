import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { renderHook, act } from "@testing-library/react";
import { useSSE } from "./useSSE";
import { SSEProvider } from "../context/SSEContext";

// ── Controllable EventSource mock ─────────────────────────────────────────────

class MockEventSource {
  static instances: MockEventSource[] = [];

  url: string;
  onopen: ((e: Event) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  closed = false;

  // Public so tests can reach in and dispatch events
  _listeners = new Map<string, ((e: MessageEvent) => void)[]>();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, handler: (e: MessageEvent) => void) {
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type)!.push(handler);
  }

  // Test helpers
  triggerOpen() {
    this.onopen?.(new Event("open"));
  }
  triggerError() {
    this.onerror?.(new Event("error"));
  }
  triggerMessage(type: string, data: unknown) {
    const e = new MessageEvent(type, { data: JSON.stringify(data) });
    (this._listeners.get(type) ?? []).forEach((fn) => fn(e));
  }
  triggerRawMessage(type: string, rawData: string) {
    const e = new MessageEvent(type, { data: rawData });
    (this._listeners.get(type) ?? []).forEach((fn) => fn(e));
  }

  close() {
    this.closed = true;
  }
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(SSEProvider, null, children);
}

beforeEach(() => {
  MockEventSource.instances = [];
  vi.useFakeTimers();
  vi.stubGlobal("EventSource", MockEventSource);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useSSE", () => {
  // ── Connection lifecycle ────────────────────────────────────────────────

  it("creates an EventSource at /api/v1/events on mount", () => {
    renderHook(() => useSSE({}), { wrapper });
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toBe("/api/v1/events");
  });

  it("closes the EventSource on unmount", () => {
    const { unmount } = renderHook(() => useSSE({}), { wrapper });
    const es = MockEventSource.instances[0];
    unmount();
    expect(es.closed).toBe(true);
  });

  // ── Event dispatching ───────────────────────────────────────────────────

  it("calls the matching listener with parsed JSON data", () => {
    const onNewShout = vi.fn();
    renderHook(() => useSSE({ new_shout: onNewShout }), { wrapper });
    const es = MockEventSource.instances[0];

    act(() => es.triggerMessage("new_shout", { id: "s1", content: "hello" }));

    expect(onNewShout).toHaveBeenCalledWith({ id: "s1", content: "hello" });
  });

  it("registers all 6 known event types", () => {
    const types = [
      "new_shout",
      "delete_shout",
      "new_comment",
      "delete_comment",
      "shout_like",
      "comment_like",
    ];
    const listeners = Object.fromEntries(types.map((t) => [t, vi.fn()]));

    renderHook(() => useSSE(listeners), { wrapper });
    const es = MockEventSource.instances[0];

    for (const type of types) {
      act(() => es.triggerMessage(type, { id: type }));
      expect(listeners[type]).toHaveBeenCalledWith({ id: type });
    }
  });

  it("does not call a listener for an unregistered event type", () => {
    const onNewShout = vi.fn();
    renderHook(() => useSSE({ new_shout: onNewShout }), { wrapper });
    const es = MockEventSource.instances[0];

    act(() => es.triggerMessage("delete_shout", { id: "s1" }));

    expect(onNewShout).not.toHaveBeenCalled();
  });

  it("does not crash on malformed JSON — listener is not called", () => {
    const onNewShout = vi.fn();
    renderHook(() => useSSE({ new_shout: onNewShout }), { wrapper });
    const es = MockEventSource.instances[0];

    act(() => es.triggerRawMessage("new_shout", "{not valid json"));

    expect(onNewShout).not.toHaveBeenCalled();
  });

  // ── Reconnect / backoff ─────────────────────────────────────────────────

  it("reconnects after an error once the backoff timer fires", () => {
    renderHook(() => useSSE({}), { wrapper });
    const es = MockEventSource.instances[0];

    act(() => es.triggerError());
    expect(MockEventSource.instances).toHaveLength(1); // not yet

    act(() => vi.advanceTimersByTime(1000));
    expect(MockEventSource.instances).toHaveLength(2); // new connection
  });

  it("doubles the backoff on each consecutive error", () => {
    renderHook(() => useSSE({}), { wrapper });

    // First error → reconnect after 1 000 ms
    act(() => MockEventSource.instances[0].triggerError());
    act(() => vi.advanceTimersByTime(999));
    expect(MockEventSource.instances).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(MockEventSource.instances).toHaveLength(2);

    // Second error → reconnect after 2 000 ms
    act(() => MockEventSource.instances[1].triggerError());
    act(() => vi.advanceTimersByTime(1999));
    expect(MockEventSource.instances).toHaveLength(2);
    act(() => vi.advanceTimersByTime(1));
    expect(MockEventSource.instances).toHaveLength(3);
  });

  it("caps backoff at 30 000 ms", () => {
    renderHook(() => useSSE({}), { wrapper });

    // Trigger enough errors to exceed the 30 000 ms cap
    // backoff doubles: 1000 → 2000 → 4000 → 8000 → 16000 → 30000 (cap)
    for (let backoff = 1000; backoff < 30_000; backoff *= 2) {
      act(() => MockEventSource.instances[MockEventSource.instances.length - 1]!.triggerError());
      act(() => vi.advanceTimersByTime(backoff));
    }
    const countBeforeCap = MockEventSource.instances.length;

    // One more error at the cap (30 000 ms)
    act(() => MockEventSource.instances[MockEventSource.instances.length - 1]!.triggerError());
    act(() => vi.advanceTimersByTime(29_999));
    expect(MockEventSource.instances).toHaveLength(countBeforeCap);

    act(() => vi.advanceTimersByTime(1));
    expect(MockEventSource.instances).toHaveLength(countBeforeCap + 1);
  });

  it("resets backoff to 1 000 ms after a successful connection", () => {
    renderHook(() => useSSE({}), { wrapper });

    // Error → doubled backoff
    act(() => MockEventSource.instances[0].triggerError());
    act(() => vi.advanceTimersByTime(1000)); // reconnect

    // Successful open → backoff resets
    act(() => MockEventSource.instances[1].triggerOpen());

    // Next error → should reconnect at 1 000 ms, not 2 000 ms
    act(() => MockEventSource.instances[1].triggerError());
    act(() => vi.advanceTimersByTime(999));
    expect(MockEventSource.instances).toHaveLength(2);
    act(() => vi.advanceTimersByTime(1));
    expect(MockEventSource.instances).toHaveLength(3);
  });

  // ── Cleanup on unmount ──────────────────────────────────────────────────

  it("does not reconnect after unmount", () => {
    const { unmount } = renderHook(() => useSSE({}), { wrapper });
    const es = MockEventSource.instances[0];

    unmount();
    act(() => es.triggerError());
    act(() => vi.advanceTimersByTime(30_000));

    expect(MockEventSource.instances).toHaveLength(1); // no new connections
  });

  it("cancels a pending reconnect timer on unmount", () => {
    const { unmount } = renderHook(() => useSSE({}), { wrapper });
    const es = MockEventSource.instances[0];

    // Arm reconnect timer
    act(() => es.triggerError());
    // Unmount before the timer fires
    unmount();
    act(() => vi.advanceTimersByTime(1000));

    // Timer fired but unmounted=true → no new EventSource
    expect(MockEventSource.instances).toHaveLength(1);
  });
});
