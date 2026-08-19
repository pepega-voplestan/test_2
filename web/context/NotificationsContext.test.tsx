import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { NotificationsProvider, useNotifications } from "./NotificationsContext";
import { SSEProvider } from "./SSEContext";
import type { Notification } from "../types";
import { navigateTo } from "../hooks/useRoute";

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
  return (
    <SSEProvider>
      <NotificationsProvider>{children}</NotificationsProvider>
    </SSEProvider>
  );
}

/** Queue a successful GET /notifications response. */
function mockNotifFetch(notifications: Notification[] = [], nextCursor: string | null = null) {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ notifications, nextCursor }),
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
    expect(result.current.sortedNotifications).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
  });

  it("does not fetch notifications when user is null", () => {
    renderHook(() => useNotifications(), { wrapper });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("NotificationsContext — user login", () => {
  it("fetches notifications when user logs in", async () => {
    mockNotifFetch([notif1]);
    mockUseAuth.mockReturnValue({ user: mockUser });

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.sortedNotifications).toHaveLength(1));
    expect(result.current.sortedNotifications[0]).toEqual(notif1);
  });

  it("sets unreadCount based on fetched notifications", async () => {
    mockNotifFetch([notif1, { ...notif1, id: "n2", isRead: true }]);
    mockUseAuth.mockReturnValue({ user: mockUser });

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.sortedNotifications).toHaveLength(2));
    expect(result.current.unreadCount).toBe(1);
  });

  it("calls GET /api/v1/notifications with credentials", async () => {
    mockNotifFetch();
    mockUseAuth.mockReturnValue({ user: mockUser });

    renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(fetch).toHaveBeenCalled());

    expect(fetch).toHaveBeenCalledWith("/api/v1/notifications?limit=20", {
      credentials: "include",
    });
  });

  it("SSE connection is open on mount", async () => {
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
    await waitFor(() => expect(result.current.sortedNotifications).toHaveLength(1));

    mockUseAuth.mockReturnValue({ user: null });
    rerender();

    await waitFor(() => expect(result.current.sortedNotifications).toEqual([]));
  });
});

describe("NotificationsContext — SSE events", () => {
  it("prepends a new notification from an SSE 'notification' event", async () => {
    mockNotifFetch([]);
    mockUseAuth.mockReturnValue({ user: mockUser });

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1));

    act(() => MockEventSource.instances[0].triggerMessage("notification", notif1));

    expect(result.current.sortedNotifications).toHaveLength(1);
    expect(result.current.sortedNotifications[0].id).toBe("n1");
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

    expect(result.current.sortedNotifications[0].isRead).toBe(false);
  });

  it("prepends SSE notification before existing ones", async () => {
    mockNotifFetch([notif1]);
    mockUseAuth.mockReturnValue({ user: mockUser });

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.sortedNotifications).toHaveLength(1));

    act(() =>
      MockEventSource.instances[0].triggerMessage("notification", notif2)
    );

    expect(result.current.sortedNotifications[0].id).toBe("n2"); // new first
    expect(result.current.sortedNotifications[1].id).toBe("n1");
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
    await waitFor(() => expect(result.current.sortedNotifications).toHaveLength(1));

    act(() => result.current.markAsRead("n1"));

    expect(result.current.sortedNotifications[0].isRead).toBe(true);
    expect(result.current.unreadCount).toBe(0);
  });

  it("does not affect other notifications when marking one read", async () => {
    mockNotifFetch([notif1, notif2]);
    mockUseAuth.mockReturnValue({ user: mockUser });

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.sortedNotifications).toHaveLength(2));

    act(() => result.current.markAsRead("n1"));

    expect(result.current.sortedNotifications.find((n) => n.id === "n1")!.isRead).toBe(true);
    expect(result.current.sortedNotifications.find((n) => n.id === "n2")!.isRead).toBe(false);
  });
});

describe("NotificationsContext — markAllAsRead", () => {
  it("marks all notifications as read optimistically", async () => {
    mockNotifFetch([notif1, notif2]);
    mockPatchOk();
    mockUseAuth.mockReturnValue({ user: mockUser });

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.sortedNotifications).toHaveLength(2));

    act(() => result.current.markAllAsRead());

    expect(result.current.unreadCount).toBe(0);
    expect(result.current.sortedNotifications.every((n) => n.isRead)).toBe(true);
  });

  it("calls PATCH /api/v1/notifications/read-all", async () => {
    mockNotifFetch([notif1]);
    mockPatchOk();
    mockUseAuth.mockReturnValue({ user: mockUser });

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.sortedNotifications).toHaveLength(1));

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
    await waitFor(() => expect(result.current.sortedNotifications).toHaveLength(2));

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
    await waitFor(() => expect(result.current.sortedNotifications).toHaveLength(1));

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
    await waitFor(() => expect(result.current.sortedNotifications).toHaveLength(2));

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

describe("NotificationsContext — pagination (hasMore / loadMore)", () => {
  it("hasMore is false when nextCursor is null", async () => {
    mockNotifFetch([notif1], null);
    mockUseAuth.mockReturnValue({ user: mockUser });

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.sortedNotifications).toHaveLength(1));
    expect(result.current.hasMore).toBe(false);
  });

  it("hasMore is true when nextCursor is a string", async () => {
    mockNotifFetch([notif1], "2026-01-01T00:00:00.000Z");
    mockUseAuth.mockReturnValue({ user: mockUser });

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.sortedNotifications).toHaveLength(1));
    expect(result.current.hasMore).toBe(true);
  });

  it("loadMore fetches next page with cursor and limit params", async () => {
    const cursor = "2026-01-01T00:00:00.000Z";
    mockNotifFetch([notif1], cursor);
    mockUseAuth.mockReturnValue({ user: mockUser });

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    // Queue the second-page response
    mockNotifFetch([notif2], null);
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.hasMore).toBe(false));

    const calls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
    expect(calls.some(url => url.includes("cursor=") && url.includes("limit=20"))).toBe(true);
  });

  it("loadMore merges next page items after existing ones", async () => {
    mockNotifFetch([notif1], "2026-01-01T00:00:00.000Z");
    mockUseAuth.mockReturnValue({ user: mockUser });

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.sortedNotifications).toHaveLength(1));

    mockNotifFetch([notif2], null);
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.sortedNotifications).toHaveLength(2));
  });

  it("loadMore deduplicates: an item present on both pages appears only once", async () => {
    mockNotifFetch([notif1], "2026-01-01T00:00:00.000Z");
    mockUseAuth.mockReturnValue({ user: mockUser });

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.sortedNotifications).toHaveLength(1));

    // Page 2 returns notif1 again (e.g. due to SSE prepend race) plus notif2
    mockNotifFetch([notif1, notif2], null);
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.sortedNotifications).toHaveLength(2));
  });

  it("loadMore sets hasMore=false when nextCursor is null in response", async () => {
    mockNotifFetch([notif1], "2026-01-01T00:00:00.000Z");
    mockUseAuth.mockReturnValue({ user: mockUser });

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    mockNotifFetch([], null);
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.hasMore).toBe(false));
  });

  it("loadMore does nothing when hasMore is false", async () => {
    mockNotifFetch([notif1], null); // nextCursor=null → hasMore=false
    mockUseAuth.mockReturnValue({ user: mockUser });

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.hasMore).toBe(false));

    const callsBefore = vi.mocked(fetch).mock.calls.length;
    act(() => result.current.loadMore());
    expect(vi.mocked(fetch).mock.calls.length).toBe(callsBefore);
  });

  it("isLoadingMore is true while fetching and false after", async () => {
    mockNotifFetch([notif1], "2026-01-01T00:00:00.000Z");
    mockUseAuth.mockReturnValue({ user: mockUser });

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    // Delay the page-2 response so we can observe isLoadingMore=true
    let resolvePage2!: (v: Response | PromiseLike<Response>) => void;
    vi.mocked(fetch).mockReturnValueOnce(
      new Promise(resolve => { resolvePage2 = resolve; }) as Promise<Response>
    );
    act(() => result.current.loadMore());
    expect(result.current.isLoadingMore).toBe(true);

    // Resolve the request
    resolvePage2({ ok: true, json: () => Promise.resolve({ notifications: [notif2], nextCursor: null }) } as unknown as Response);
    await waitFor(() => expect(result.current.isLoadingMore).toBe(false));
  });
});

describe("NotificationsContext — sortedNotifications order", () => {
  it("sorts notifications by timestamp desc regardless of read status", async () => {
    const older: Notification = { ...notif1, id: "older", isRead: false, timestamp: "2026-01-01T00:00:00Z" };
    const newer: Notification = { ...notif1, id: "newer", isRead: true, timestamp: "2026-01-03T00:00:00Z" };
    mockNotifFetch([older, newer], null);
    mockUseAuth.mockReturnValue({ user: mockUser });

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.sortedNotifications).toHaveLength(2));

    // newer timestamp first, read/unread status does not affect order
    expect(result.current.sortedNotifications[0].id).toBe("newer");
    expect(result.current.sortedNotifications[1].id).toBe("older");
  });

  it("markAsRead does not change the position of a notification in the list", async () => {
    const older: Notification = { ...notif1, id: "older", isRead: false, timestamp: "2026-01-01T00:00:00Z" };
    const newer: Notification = { ...notif1, id: "newer", isRead: true, timestamp: "2026-01-03T00:00:00Z" };
    mockNotifFetch([older, newer], null);
    mockUseAuth.mockReturnValue({ user: mockUser });

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.sortedNotifications).toHaveLength(2));

    act(() => result.current.markAsRead("older"));

    // Order unchanged — timestamp order is preserved
    expect(result.current.sortedNotifications[0].id).toBe("newer");
    expect(result.current.sortedNotifications[1].id).toBe("older");
  });
});

describe("NotificationsContext — SSE deduplication", () => {
  it("does not add a duplicate when SSE pushes an already-loaded notification", async () => {
    mockNotifFetch([notif1], null);
    mockUseAuth.mockReturnValue({ user: mockUser });

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1));
    await waitFor(() => expect(result.current.sortedNotifications).toHaveLength(1));

    // SSE fires the same notification again (e.g. reconnect replay)
    act(() => MockEventSource.instances[0].triggerMessage("notification", notif1));

    expect(result.current.sortedNotifications).toHaveLength(1);
  });
});

describe("NotificationsContext — guard", () => {
  it("throws when useNotifications is called outside NotificationsProvider", () => {
    expect(() => renderHook(() => useNotifications())).toThrow(
      "useNotifications must be used within"
    );
  });
});

describe("NotificationsContext — tab title across history navigation", () => {
  /** Records writes without swallowing them — jsdom's own setter still runs. */
  function spyOnTitleWrites(): { writes: string[]; restore: () => void } {
    const proto = Object.getOwnPropertyDescriptor(Document.prototype, "title")!;
    const writes: string[] = [];
    Object.defineProperty(document, "title", {
      configurable: true,
      get: () => proto.get!.call(document),
      set: (v: string) => {
        writes.push(v);
        proto.set!.call(document, v);
      },
    });
    return { writes, restore: () => delete (document as unknown as { title?: string }).title };
  }

  /** A real back/forward: a popstate with none of navigateTo's push marker. */
  function dispatchTraversal(event: Event) {
    act(() => {
      window.dispatchEvent(event);
    });
  }

  /** index.html's icon link is absent in jsdom; the effect needs one to paint. */
  function installFaviconLink() {
    const link = document.createElement("link");
    link.setAttribute("rel", "icon");
    link.setAttribute("href", "/favicon.svg");
    document.head.appendChild(link);
    return { link, restore: () => link.remove() };
  }

  /**
   * jsdom has neither a canvas nor image loading. Stand in for both so the
   * badged icon the effect builds can actually be observed. With `defer`, the
   * queued onload is held back so a badge can be made to land late.
   */
  function stubBadgeCanvas({ defer = false } = {}) {
    const dataUrl = "data:image/png;base64,BADGED";
    const ctx = {
      drawImage: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(),
      stroke: vi.fn(), fillStyle: "", strokeStyle: "", lineWidth: 0,
    };
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    const toDataURL = vi
      .spyOn(HTMLCanvasElement.prototype, "toDataURL")
      .mockReturnValue(dataUrl);

    const pending: (() => void)[] = [];
    const srcDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src")!;
    Object.defineProperty(HTMLImageElement.prototype, "src", {
      configurable: true,
      get(this: HTMLImageElement) { return srcDesc.get!.call(this); },
      set(this: HTMLImageElement, v: string) {
        srcDesc.set!.call(this, v);
        const fire = () => this.onload?.(new Event("load"));
        if (defer) pending.push(fire);
        else fire();
      },
    });

    return {
      dataUrl,
      flushImageLoads: () => { pending.splice(0).forEach((fire) => fire()); },
      restore: () => {
        getContext.mockRestore();
        toDataURL.mockRestore();
        Object.defineProperty(HTMLImageElement.prototype, "src", srcDesc);
      },
    };
  }

  it("writes the read count to the tab before a navigation can record it", async () => {
    mockNotifFetch([notif1]);
    mockPatchOk();
    mockUseAuth.mockReturnValue({ user: mockUser });

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.unreadCount).toBe(1));

    // handleClick calls markAsRead and then navigateTo in one tick, so what
    // matters is the title mid-tick — React has not committed the read yet
    let titleAtPush = "";
    act(() => {
      result.current.markAsRead("n1");
      titleAtPush = document.title;
    });

    expect(titleAtPush).toBe("Вопли");
  });

  it("re-applies the title when the browser restores a stale one on back", async () => {
    mockNotifFetch([notif1]);
    mockPatchOk();
    mockUseAuth.mockReturnValue({ user: mockUser });

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.sortedNotifications).toHaveLength(1));
    expect(document.title).toBe("(1) Вопли");

    act(() => result.current.markAsRead("n1"));
    expect(document.title).toBe("Вопли");

    // Stands in for the browser repainting the tab from the title it recorded
    // with the history entry, which predates the read
    document.title = "(1) Вопли";
    dispatchTraversal(new PopStateEvent("popstate"));

    expect(document.title).toBe("Вопли");
  });

  it("forces a real title change on back even when document.title already matches", async () => {
    mockNotifFetch([notif1]);
    mockPatchOk();
    mockUseAuth.mockReturnValue({ user: mockUser });

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.sortedNotifications).toHaveLength(1));
    act(() => result.current.markAsRead("n1"));

    const { writes, restore } = spyOnTitleWrites();
    try {
      // document.title already reads correct here while the tab does not
      dispatchTraversal(new PopStateEvent("popstate"));

      expect(writes).toEqual(["", "Вопли"]);
    } finally {
      restore();
    }
  });

  it("re-applies once more after the restore may have landed", async () => {
    mockNotifFetch([notif1]);
    mockUseAuth.mockReturnValue({ user: mockUser });

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.unreadCount).toBe(1));

    vi.useFakeTimers();
    try {
      dispatchTraversal(new PopStateEvent("popstate"));
      document.title = "Вопли"; // restore lands after the synchronous pass
      act(() => vi.advanceTimersByTime(0));

      expect(document.title).toBe("(1) Вопли");
    } finally {
      vi.useRealTimers();
    }
  });

  it("re-applies the unread title on a bfcache restore", async () => {
    mockNotifFetch([notif1]);
    mockUseAuth.mockReturnValue({ user: mockUser });

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.unreadCount).toBe(1));

    document.title = "Вопли";
    dispatchTraversal(new PageTransitionEvent("pageshow", { persisted: true }));

    expect(document.title).toBe("(1) Вопли");
  });

  it("ignores the synthetic popstate navigateTo fires on in-app links", async () => {
    mockNotifFetch([notif1]);
    mockUseAuth.mockReturnValue({ user: mockUser });

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.unreadCount).toBe(1));

    const { writes, restore } = spyOnTitleWrites();
    try {
      act(() => navigateTo("/shout/s1"));

      expect(writes).toEqual([]); // no blank write onto the entry being pushed
    } finally {
      restore();
    }
  });

  it("ignores the pageshow of an ordinary page load", async () => {
    mockNotifFetch([notif1]);
    mockUseAuth.mockReturnValue({ user: mockUser });

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.unreadCount).toBe(1));

    const { writes, restore } = spyOnTitleWrites();
    try {
      dispatchTraversal(new PageTransitionEvent("pageshow", { persisted: false }));

      expect(writes).toEqual([]);
    } finally {
      restore();
    }
  });

  it("stops re-applying the title once unmounted", async () => {
    mockNotifFetch([notif1]);
    mockUseAuth.mockReturnValue({ user: mockUser });

    const { result, unmount } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.unreadCount).toBe(1));

    unmount();
    document.title = "something else";
    dispatchTraversal(new PopStateEvent("popstate"));

    expect(document.title).toBe("something else");
  });

  it("re-applies the badged favicon, not just the title, on back", async () => {
    mockNotifFetch([notif1]);
    mockUseAuth.mockReturnValue({ user: mockUser });

    const canvas = stubBadgeCanvas();
    const favicon = installFaviconLink();
    try {
      const { result } = renderHook(() => useNotifications(), { wrapper });
      await waitFor(() => expect(result.current.unreadCount).toBe(1));
      expect(favicon.link.getAttribute("href")).toBe(canvas.dataUrl);

      // The browser repaints the tab — icon included — from what it recorded
      // with the entry being restored, which predates the badge.
      favicon.link.setAttribute("href", "/favicon.svg");
      dispatchTraversal(new PopStateEvent("popstate"));

      expect(favicon.link.getAttribute("href")).toBe(canvas.dataUrl);
    } finally {
      favicon.restore();
      canvas.restore();
    }
  });

  it("clears a restored badge on back once the notification has been read", async () => {
    mockNotifFetch([notif1]);
    mockPatchOk();
    mockUseAuth.mockReturnValue({ user: mockUser });

    const canvas = stubBadgeCanvas();
    const favicon = installFaviconLink();
    try {
      const { result } = renderHook(() => useNotifications(), { wrapper });
      await waitFor(() => expect(result.current.unreadCount).toBe(1));

      act(() => result.current.markAsRead("n1"));
      expect(favicon.link.getAttribute("href")).toBe("/favicon.svg");

      favicon.link.setAttribute("href", canvas.dataUrl); // stale badge restored
      dispatchTraversal(new PopStateEvent("popstate"));

      expect(favicon.link.getAttribute("href")).toBe("/favicon.svg");
    } finally {
      favicon.restore();
      canvas.restore();
    }
  });

  it("drops a badge that finishes drawing after the count already went to zero", async () => {
    mockNotifFetch([notif1]);
    mockPatchOk();
    mockUseAuth.mockReturnValue({ user: mockUser });

    const canvas = stubBadgeCanvas({ defer: true });
    const favicon = installFaviconLink();
    try {
      const { result } = renderHook(() => useNotifications(), { wrapper });
      await waitFor(() => expect(result.current.unreadCount).toBe(1));

      // Read it before the badge finishes drawing, then let the draw land.
      act(() => result.current.markAsRead("n1"));
      act(() => canvas.flushImageLoads());

      expect(favicon.link.getAttribute("href")).toBe("/favicon.svg");
    } finally {
      favicon.restore();
      canvas.restore();
    }
  });
});
