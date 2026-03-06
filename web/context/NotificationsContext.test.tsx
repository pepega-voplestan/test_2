import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { NotificationsProvider, useNotifications } from "./NotificationsContext";
import type { Notification } from "../types";

// ── Mock useAuth ──────────────────────────────────────────────────────────────

const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock("./AuthContext", () => ({ useAuth: () => mockUseAuth() }));

// ── Controllable EventSource mock ─────────────────────────────────────────────

class MockEventSource {
  static instances: MockEventSource[] = [];

  onopen: ((e: Event) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  closed = false;
  _listeners = new Map<string, ((e: MessageEvent) => void)[]>();

  constructor(_url: string) {
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

  triggerError() {
    this.onerror?.(new Event("error"));
  }

  close() {
    this.closed = true;
  }
}

// ── Shared test fixtures ──────────────────────────────────────────────────────

const mockUser = { id: "u1", name: "alice", avatar: "" };

const notif1: Notification = {
  id: "n1",
  type: "reply",
  actor: { id: "u2", name: "bob", avatar: "" },
  shoutId: "s1",
  commentId: "c1",
  isRead: false,
  timestamp: "2026-01-01T00:00:00Z",
  snippet: "hi there",
};

const notif2: Notification = { ...notif1, id: "n2" };

function wrapper({ children }: { children: React.ReactNode }) {
  return <NotificationsProvider>{children}</NotificationsProvider>;
}

/** Queue a successful GET /notifications response. */
function mockNotifFetch(notifications: Notification[] = []) {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ notifications }),
  } as Response);
}

/** Queue a generic successful PATCH response. */
function mockPatchOk() {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({}),
  } as Response);
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  MockEventSource.instances = [];
  vi.stubGlobal("EventSource", MockEventSource);
  vi.stubGlobal("fetch", vi.fn());
  mockUseAuth.mockReturnValue({ user: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("NotificationsContext — logged out", () => {
  it("starts with empty notifications and unreadCount=0", () => {
    const { result } = renderHook(() => useNotifications(), { wrapper });
    expect(result.current.notifications).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
  });

  it("does not fetch or connect SSE when user is null", () => {
    renderHook(() => useNotifications(), { wrapper });
    expect(fetch).not.toHaveBeenCalled();
    expect(MockEventSource.instances).toHaveLength(0);
  });
});

describe("NotificationsContext — user login", () => {
  it("fetches notifications when user logs in", async () => {
    mockNotifFetch([notif1]);
    mockUseAuth.mockReturnValue({ user: mockUser });

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
    expect(result.current.notifications[0]).toEqual(notif1);
  });

  it("sets unreadCount based on fetched notifications", async () => {
    mockNotifFetch([notif1, { ...notif1, id: "n2", isRead: true }]);
    mockUseAuth.mockReturnValue({ user: mockUser });

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.notifications).toHaveLength(2));
    expect(result.current.unreadCount).toBe(1);
  });

  it("calls GET /api/v1/notifications with credentials", async () => {
    mockNotifFetch();
    mockUseAuth.mockReturnValue({ user: mockUser });

    renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(fetch).toHaveBeenCalled());

    expect(fetch).toHaveBeenCalledWith("/api/v1/notifications", {
      credentials: "include",
    });
  });

  it("opens an SSE connection when user logs in", async () => {
    mockNotifFetch();
    mockUseAuth.mockReturnValue({ user: mockUser });

    renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1));
  });
});

describe("NotificationsContext — user logout", () => {
  it("clears notifications when user logs out", async () => {
    mockNotifFetch([notif1]);
    mockUseAuth.mockReturnValue({ user: mockUser });

    const { result, rerender } = renderHook(() => useNotifications(), {
      wrapper,
    });
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));

    mockUseAuth.mockReturnValue({ user: null });
    rerender();

    await waitFor(() => expect(result.current.notifications).toEqual([]));
  });
});

describe("NotificationsContext — SSE events", () => {
  it("prepends a new notification from an SSE 'notification' event", async () => {
    mockNotifFetch([]);
    mockUseAuth.mockReturnValue({ user: mockUser });

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1));

    act(() => MockEventSource.instances[0].triggerMessage("notification", notif1));

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0].id).toBe("n1");
  });

  it("SSE-pushed notifications always arrive with isRead=false", async () => {
    mockNotifFetch([]);
    mockUseAuth.mockReturnValue({ user: mockUser });

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1));

    act(() =>
      MockEventSource.instances[0].triggerMessage("notification", {
        ...notif1,
        isRead: true, // server might send true, context forces false
      })
    );

    expect(result.current.notifications[0].isRead).toBe(false);
  });

  it("prepends SSE notification before existing ones", async () => {
    mockNotifFetch([notif1]);
    mockUseAuth.mockReturnValue({ user: mockUser });

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));

    act(() =>
      MockEventSource.instances[0].triggerMessage("notification", notif2)
    );

    expect(result.current.notifications[0].id).toBe("n2"); // new first
    expect(result.current.notifications[1].id).toBe("n1");
  });

  it("closes SSE connection on unmount", async () => {
    mockNotifFetch([]);
    mockUseAuth.mockReturnValue({ user: mockUser });

    const { unmount } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1));

    unmount();
    expect(MockEventSource.instances[0].closed).toBe(true);
  });
});

describe("NotificationsContext — markAsRead", () => {
  it("optimistically marks a notification as read", async () => {
    mockNotifFetch([notif1]);
    mockUseAuth.mockReturnValue({ user: mockUser });

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));

    act(() => result.current.markAsRead("n1"));

    expect(result.current.notifications[0].isRead).toBe(true);
    expect(result.current.unreadCount).toBe(0);
  });

  it("does not affect other notifications when marking one read", async () => {
    mockNotifFetch([notif1, notif2]);
    mockUseAuth.mockReturnValue({ user: mockUser });

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.notifications).toHaveLength(2));

    act(() => result.current.markAsRead("n1"));

    expect(result.current.notifications.find((n) => n.id === "n1")!.isRead).toBe(true);
    expect(result.current.notifications.find((n) => n.id === "n2")!.isRead).toBe(false);
  });
});

describe("NotificationsContext — markAllAsRead", () => {
  it("marks all notifications as read optimistically", async () => {
    mockNotifFetch([notif1, notif2]);
    mockPatchOk();
    mockUseAuth.mockReturnValue({ user: mockUser });

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.notifications).toHaveLength(2));

    act(() => result.current.markAllAsRead());

    expect(result.current.unreadCount).toBe(0);
    expect(result.current.notifications.every((n) => n.isRead)).toBe(true);
  });

  it("calls PATCH /api/v1/notifications/read-all", async () => {
    mockNotifFetch([notif1]);
    mockPatchOk();
    mockUseAuth.mockReturnValue({ user: mockUser });

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));

    act(() => result.current.markAllAsRead());

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/notifications/read-all",
      expect.objectContaining({ method: "PATCH" })
    );
  });
});

describe("NotificationsContext — flushReads", () => {
  it("sends accumulated IDs as a batch to /notifications/read-batch", async () => {
    mockNotifFetch([notif1, notif2]);
    mockPatchOk();
    mockUseAuth.mockReturnValue({ user: mockUser });

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.notifications).toHaveLength(2));

    act(() => {
      result.current.markAsRead("n1");
      result.current.markAsRead("n2");
    });
    act(() => result.current.flushReads());

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/notifications/read-batch",
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining("n1"),
      })
    );
  });

  it("sends nothing when there are no pending reads", async () => {
    mockNotifFetch([]);
    mockUseAuth.mockReturnValue({ user: mockUser });

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1));

    const callsBefore = vi.mocked(fetch).mock.calls.length;
    act(() => result.current.flushReads());

    expect(vi.mocked(fetch).mock.calls.length).toBe(callsBefore); // no extra call
  });
});

describe("NotificationsContext — safety timer", () => {
  it("automatically flushes reads after 5 seconds", async () => {
    mockNotifFetch([notif1]);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response);
    mockUseAuth.mockReturnValue({ user: mockUser });

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));

    // Switch to fake timers only after async setup is done
    vi.useFakeTimers();
    try {
      act(() => result.current.markAsRead("n1"));
      const callsBefore = vi.mocked(fetch).mock.calls.length;

      // Before 5 s — batch not yet sent
      act(() => vi.advanceTimersByTime(4999));
      expect(vi.mocked(fetch).mock.calls.length).toBe(callsBefore);

      // After 5 s — safety timer fires
      act(() => vi.advanceTimersByTime(1));
      expect(fetch).toHaveBeenCalledWith(
        "/api/v1/notifications/read-batch",
        expect.anything()
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("arms the safety timer only once for multiple markAsRead calls", async () => {
    mockNotifFetch([notif1, notif2]);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response);
    mockUseAuth.mockReturnValue({ user: mockUser });

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.notifications).toHaveLength(2));

    // Switch to fake timers only after async setup is done
    vi.useFakeTimers();
    try {
      // Two markAsRead calls — only one timer should exist
      act(() => {
        result.current.markAsRead("n1");
        result.current.markAsRead("n2");
      });

      act(() => vi.advanceTimersByTime(5000));

      // The batch request should contain both IDs in one call
      const batchCalls = vi.mocked(fetch).mock.calls.filter(([url]) =>
        String(url).includes("read-batch")
      );
      expect(batchCalls).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("NotificationsContext — guard", () => {
  it("throws when useNotifications is called outside NotificationsProvider", () => {
    expect(() => renderHook(() => useNotifications())).toThrow(
      "useNotifications must be used within"
    );
  });
});
