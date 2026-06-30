import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { SSEProvider, useSSEContext } from "./SSEContext";

// ── Mock useAuth ──────────────────────────────────────────────────────────────

const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock("./AuthContext", () => ({ useAuth: () => mockUseAuth() }));

// ── Controllable EventSource mock ─────────────────────────────────────────────

class MockEventSource {
  static instances: MockEventSource[] = [];

  url: string;
  onopen: ((e: Event) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  closed = false;
  _listeners = new Map<string, ((e: MessageEvent) => void)[]>();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, handler: (e: MessageEvent) => void) {
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type)!.push(handler);
  }

  triggerMessage(type: string, data: unknown) {
    const e = new MessageEvent(type, { data: JSON.stringify(data) });
    (this._listeners.get(type) ?? []).forEach((fn) => fn(e));
  }

  close() {
    this.closed = true;
  }
}

const mockUser = { id: "u1", name: "alice", avatar: "" };

function wrapper({ children }: { children: React.ReactNode }) {
  return <SSEProvider>{children}</SSEProvider>;
}

beforeEach(() => {
  MockEventSource.instances = [];
  vi.stubGlobal("EventSource", MockEventSource);
  mockUseAuth.mockReturnValue({ user: null, loading: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── No connection for anonymous / loading (US1, FR-002, SC-001) ─────────────────

describe("SSEProvider — anonymous", () => {
  it("opens no EventSource when there is no authenticated user", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    renderHook(() => useSSEContext(), { wrapper });
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it("opens no EventSource while auth state is still loading", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    renderHook(() => useSSEContext(), { wrapper });
    expect(MockEventSource.instances).toHaveLength(0);
  });
});

// ── Connection for authenticated users (US2) ────────────────────────────────────

describe("SSEProvider — authenticated", () => {
  it("opens exactly one EventSource at /api/v1/events when authenticated", () => {
    mockUseAuth.mockReturnValue({ user: mockUser, loading: false });
    renderHook(() => useSSEContext(), { wrapper });

    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toBe("/api/v1/events");
  });

  it("dispatches parsed events to subscribers", () => {
    mockUseAuth.mockReturnValue({ user: mockUser, loading: false });
    const { result } = renderHook(() => useSSEContext(), { wrapper });

    const handler = vi.fn();
    act(() => {
      result.current.subscribe("new_shout", handler);
    });

    act(() => MockEventSource.instances[0].triggerMessage("new_shout", { id: "s1" }));
    expect(handler).toHaveBeenCalledWith({ id: "s1" });
  });
});

// ── Auth-state transitions (US3, FR-006, FR-007) ────────────────────────────────

describe("SSEProvider — auth transitions", () => {
  it("opens a connection when an anonymous visitor signs in", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    const { rerender } = renderHook(() => useSSEContext(), { wrapper });
    expect(MockEventSource.instances).toHaveLength(0);

    mockUseAuth.mockReturnValue({ user: mockUser, loading: false });
    rerender();

    expect(MockEventSource.instances).toHaveLength(1);
  });

  it("closes the connection when the user signs out", () => {
    mockUseAuth.mockReturnValue({ user: mockUser, loading: false });
    const { rerender } = renderHook(() => useSSEContext(), { wrapper });
    const es = MockEventSource.instances[0];
    expect(es).toBeDefined();

    mockUseAuth.mockReturnValue({ user: null, loading: false });
    rerender();

    expect(es.closed).toBe(true);
  });
});
