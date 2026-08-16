import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { screen, act, render } from "@testing-library/react";
import ShoutFeed, { FEED_SCROLL_STORAGE_KEY } from "../../components/ShoutFeed";
import { SSEProvider } from "../../context/SSEContext";
import { ContentPreferencesProvider } from "../../context/ContentPreferencesContext";
import type { Shout } from "../../types";

// ShoutFeed only needs a logged-in user id from AuthContext; avoid the real
// provider's /api/v1/me fetch by mocking the hook directly (same pattern as
// useSSE.test.ts).
const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock("../../context/AuthContext", () => ({ useAuth: () => mockUseAuth() }));

// Stub out ShoutCard/ShoutInput — this suite only exercises ShoutFeed's own
// state logic (remove_shout/delete_shout handling, removeShout branching),
// not ShoutCard's rendering.
vi.mock("../../components/ShoutCard", () => ({
  default: ({ shout, onDelete }: { shout: Shout; onDelete?: (id: string) => void }) => (
    <div data-testid={`shout-${shout.id}`}>
      {shout.isDeleted ? "DELETED_PLACEHOLDER" : shout.content}
      <button onClick={() => onDelete?.(shout.id)}>delete-{shout.id}</button>
    </div>
  ),
}));
vi.mock("../../components/ShoutInput", () => ({ default: () => null }));

// ── Controllable EventSource mock (same approach as web/hooks/useSSE.test.ts) ─
class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onopen: ((e: Event) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
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
  close() {}
}

function makeShout(overrides: Partial<Shout> = {}): Shout {
  return {
    id: "s1",
    user: { id: "author1", name: "alice", avatar: "" },
    content: "Hello",
    timestamp: new Date().toISOString(),
    likes: 0,
    comments: [],
    ...overrides,
  };
}

function mockFetchShouts(shouts: Shout[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ shouts, hasMore: false, nextCursor: null }),
      } as Response)
    )
  );
}

// Stubs Element.prototype.getBoundingClientRect so ShoutFeed's anchor-
// detection (which measures each rendered shout's wrapper div — a real DOM
// node, not covered by the mocked ShoutCard above) sees a controlled `top`
// per shout. Matches wrapper divs to shout ids via the mocked ShoutCard's
// own `data-testid="shout-{id}"` child. Returns a restore function.
function stubShoutTops(topsByShoutId: Record<string, number>) {
  const spy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const child = this.querySelector('[data-testid^="shout-"]');
    const shoutId = child?.getAttribute("data-testid")?.replace("shout-", "");
    const top = shoutId && shoutId in topsByShoutId ? topsByShoutId[shoutId] : 0;
    return { top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top, toJSON: () => {} } as DOMRect;
  });
  return () => spy.mockRestore();
}

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ContentPreferencesProvider>
      <SSEProvider>{children}</SSEProvider>
    </ContentPreferencesProvider>
  );
}

beforeEach(() => {
  // ShoutFeed persists scroll-restore state to sessionStorage on unmount
  // (see FEED_SCROLL_STORAGE_KEY) — clear it so one test's unmount can't be
  // read as a pending restore by the next test's mount.
  sessionStorage.clear();
  MockEventSource.instances = [];
  vi.stubGlobal("EventSource", MockEventSource);
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  mockUseAuth.mockReturnValue({ user: { id: "me", name: "me", avatar: "" }, loading: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ShoutFeed — remove_shout / delete_shout handling", () => {
  it("removes a shout entirely on a remove_shout SSE event from another user", async () => {
    const shout = makeShout({ id: "s1", comments: [] });
    mockFetchShouts([shout]);

    render(<ShoutFeed />, { wrapper });
    await screen.findByTestId("shout-s1");

    const es = MockEventSource.instances[0];
    act(() => es.triggerMessage("remove_shout", { shoutId: "s1", userId: "other-user" }));

    expect(screen.queryByTestId("shout-s1")).not.toBeInTheDocument();
  });

  it("does not remove the shout for a remove_shout event the current user triggered themselves", async () => {
    const shout = makeShout({ id: "s1", comments: [] });
    mockFetchShouts([shout]);

    render(<ShoutFeed />, { wrapper });
    await screen.findByTestId("shout-s1");

    const es = MockEventSource.instances[0];
    act(() => es.triggerMessage("remove_shout", { shoutId: "s1", userId: "me" }));

    // Self-originated broadcasts are ignored (already reflected via the local onDelete path)
    expect(screen.getByTestId("shout-s1")).toBeInTheDocument();
  });

  it("keeps the placeholder behavior unchanged for a delete_shout SSE event from another user", async () => {
    const shout = makeShout({ id: "s2", content: "Has a comment", comments: [{ id: "c1" } as never] });
    mockFetchShouts([shout]);

    render(<ShoutFeed />, { wrapper });
    await screen.findByTestId("shout-s2");

    const es = MockEventSource.instances[0];
    act(() => es.triggerMessage("delete_shout", { shoutId: "s2", userId: "other-user" }));

    expect(screen.getByTestId("shout-s2")).toHaveTextContent("DELETED_PLACEHOLDER");
  });
});

describe("ShoutFeed — removeShout (author's own delete callback)", () => {
  it("removes the shout entirely when it has zero comments", async () => {
    const shout = makeShout({ id: "s3", comments: [] });
    mockFetchShouts([shout]);

    render(<ShoutFeed />, { wrapper });
    const card = await screen.findByTestId("shout-s3");

    act(() => card.querySelector("button")!.click());

    expect(screen.queryByTestId("shout-s3")).not.toBeInTheDocument();
  });

  it("falls back to the placeholder patch when the shout has comments (unchanged behavior)", async () => {
    const shout = makeShout({ id: "s4", content: "Has a comment", comments: [{ id: "c1" } as never] });
    mockFetchShouts([shout]);

    render(<ShoutFeed />, { wrapper });
    const card = await screen.findByTestId("shout-s4");

    act(() => card.querySelector("button")!.click());

    expect(screen.getByTestId("shout-s4")).toHaveTextContent("DELETED_PLACEHOLDER");
  });
});

describe("ShoutFeed — Популярные tab click toggles sort (likes ↔ comments)", () => {
  function lastFetchedUrl(fetchMock: ReturnType<typeof vi.fn>): string {
    const calls = fetchMock.mock.calls;
    return String(calls[calls.length - 1][0]);
  }

  it("clicking the tab while inactive switches to it without changing sort", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: async () => ({ shouts: [], hasMore: false, nextCursor: null }) } as Response)
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<ShoutFeed />, { wrapper });
    await act(async () => {});

    const tab = screen.getByText("Популярные");
    act(() => tab.click());
    await act(async () => {});

    const url = lastFetchedUrl(fetchMock);
    expect(url).toContain("sortBy=popular");
    expect(url).toContain("popularSort=likes"); // default sort, unchanged by the switch itself
  });

  it("clicking the tab again while already active toggles the sort instead of no-op", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: async () => ({ shouts: [], hasMore: false, nextCursor: null }) } as Response)
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<ShoutFeed />, { wrapper });
    await act(async () => {});

    const tab = screen.getByText("Популярные");
    act(() => tab.click()); // 'new' -> 'popular', sort stays 'likes'
    await act(async () => {});
    act(() => tab.click()); // already active -> toggles to 'comments'
    await act(async () => {});

    expect(lastFetchedUrl(fetchMock)).toContain("popularSort=comments");

    act(() => tab.click()); // toggles back to 'likes'
    await act(async () => {});

    expect(lastFetchedUrl(fetchMock)).toContain("popularSort=likes");
  });
});

describe("ShoutFeed — anchor-based scroll position restore across navigation (e.g. Назад from a shout)", () => {
  // specs/009-anchor-scroll-restore: identity-based restore replaced the
  // earlier pixel-offset SavedFeedState shape — the reader's position is now
  // "which shout was at the top, and how far into it," not a raw scrollY, so
  // it survives new content appearing above it while they're away.

  function jsonResponse(body: unknown): Response {
    return { ok: true, json: async () => body } as Response;
  }

  function makeAnchor(overrides: Partial<{
    shoutId: string; offsetFromTop: number; approxItemsAbove: number;
    activeTab: "new" | "popular"; popularSort: "likes" | "comments";
  }> = {}) {
    return {
      kind: "anchor" as const,
      shoutId: "a1",
      offsetFromTop: 0,
      approxItemsAbove: 0,
      activeTab: "new" as const,
      popularSort: "likes" as const,
      ...overrides,
    };
  }

  // Object.defineProperty on document.documentElement isn't reset by the
  // outer afterEach's vi.unstubAllGlobals() (that only covers globalThis
  // stubs) — restore it manually so overrides don't leak into other tests.
  afterEach(() => {
    Object.defineProperty(document.documentElement, "scrollHeight", { value: 0, configurable: true });
  });

  it("saves the topmost-at-or-past-top shout as the anchor, with its offset and position index, on unmount", async () => {
    mockFetchShouts([makeShout({ id: "r1" }), makeShout({ id: "r2" })]);
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { cb(0); return 0; });
    const restoreRects = stubShoutTops({ r1: -50, r2: 300 }); // r1 already scrolled past; r2 still below the fold

    const { unmount } = render(<ShoutFeed />, { wrapper });
    await screen.findByTestId("shout-r2");
    act(() => { window.dispatchEvent(new Event("scroll")); }); // triggers the rAF-throttled recompute

    unmount();
    restoreRects();

    const saved = JSON.parse(sessionStorage.getItem(FEED_SCROLL_STORAGE_KEY)!);
    expect(saved).toEqual(makeAnchor({ shoutId: "r1", offsetFromTop: -50, approxItemsAbove: 0 }));
  });

  it("saves the last live-tracked anchor, not one freshly measured from (possibly already-removed) DOM at unmount time", async () => {
    // Reproduces the real bug this session found and fixed once already for
    // window.scrollY: browsers mutate/remove DOM as part of the SAME commit
    // that unmounts this component, before any useEffect cleanup runs — so
    // measuring anything reactively at unmount time reads back stale/zeroed
    // data, not where things actually were. liveAnchorRef must win here, not
    // whatever getBoundingClientRect would report if queried fresh.
    mockFetchShouts([makeShout({ id: "r3" })]);
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { cb(0); return 0; });
    const restoreRects = stubShoutTops({ r3: -80 });

    const { unmount } = render(<ShoutFeed />, { wrapper });
    await screen.findByTestId("shout-r3");
    act(() => { window.dispatchEvent(new Event("scroll")); }); // live-tracks offsetFromTop: -80

    restoreRects(); // reverts to the default (all-zero) rect — simulates the DOM already having changed, no scroll event fired for it
    unmount();

    const saved = JSON.parse(sessionStorage.getItem(FEED_SCROLL_STORAGE_KEY)!);
    expect(saved.shoutId).toBe("r3");
    expect(saved.offsetFromTop).toBe(-80);
  });

  it("restores by identity: pages until the anchor shout is found, regardless of how many/which items load ahead of it", async () => {
    sessionStorage.setItem(
      FEED_SCROLL_STORAGE_KEY,
      JSON.stringify(makeAnchor({ shoutId: "target", offsetFromTop: -20, approxItemsAbove: 3, activeTab: "popular", popularSort: "comments" }))
    );

    // Page 1 surfaces a shout posted while the reader was away (not the
    // target); the target only shows up on page 2 — approxItemsAbove (3)
    // deliberately does NOT match this, since accuracy must not depend on
    // item counts matching (FR-004).
    const fetchMock = vi.fn((url: string) => {
      const isPage2 = url.includes("offset=1");
      return Promise.resolve(
        jsonResponse({ shouts: [makeShout({ id: isPage2 ? "target" : "newer" })], hasMore: !isPage2, nextCursor: null })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ShoutFeed />, { wrapper });

    await screen.findByTestId("shout-newer");
    await screen.findByTestId("shout-target");

    // Tab/sort restored correctly alongside the anchor search (FR-008).
    expect(fetchMock.mock.calls[0][0]).toContain("sortBy=popular");
    expect(fetchMock.mock.calls[0][0]).toContain("popularSort=comments");
    expect(sessionStorage.getItem(FEED_SCROLL_STORAGE_KEY)).toBeNull();
  });

  it("positions correctly with a single fetch when the anchor is on the first page — no regression vs. the shipped pixel-based behavior when nothing changed", async () => {
    sessionStorage.setItem(FEED_SCROLL_STORAGE_KEY, JSON.stringify(makeAnchor({ shoutId: "a1" })));
    const fetchMock = vi.fn(() =>
      Promise.resolve(jsonResponse({ shouts: [makeShout({ id: "a1" })], hasMore: false, nextCursor: null }))
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<ShoutFeed />, { wrapper });
    await screen.findByTestId("shout-a1");

    expect(fetchMock).toHaveBeenCalledTimes(1); // no extra paging needed
    expect(sessionStorage.getItem(FEED_SCROLL_STORAGE_KEY)).toBeNull();
  });

  it("attaches infinite-scroll pagination after a restore completes (regression: sentinel doesn't exist yet on the first effect run while restoring)", async () => {
    // The sentinel <div ref={loaderRef}> only renders in the non-restoring
    // branch, so on a restore-from-anchor mount the IntersectionObserver
    // effect's first run finds loaderRef still null and bails out. Without
    // `restoring` in that effect's deps, it never gets a second chance once
    // the real sentinel actually mounts — auto-load-more pagination would
    // stay silently dead for the rest of that page's lifetime.
    class TrackingIntersectionObserver {
      static observeCalls = 0;
      constructor(_cb: IntersectionObserverCallback) {}
      observe() { TrackingIntersectionObserver.observeCalls++; }
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("IntersectionObserver", TrackingIntersectionObserver);

    sessionStorage.setItem(FEED_SCROLL_STORAGE_KEY, JSON.stringify(makeAnchor({ shoutId: "a1" })));
    mockFetchShouts([makeShout({ id: "a1" })]);

    render(<ShoutFeed />, { wrapper });
    await screen.findByTestId("shout-a1");

    await vi.waitFor(() => expect(TrackingIntersectionObserver.observeCalls).toBeGreaterThan(0));
  });

  it("scrolls to an estimated position immediately on mount — before any network fetch resolves — then corrects once the anchor actually renders", async () => {
    // This is what eliminates the flash-to-top: the estimate (derived
    // synchronously from the saved anchor's approxItemsAbove, not from
    // anything that has to load first) fires via a useLayoutEffect on the
    // very first render. The exact position is only knowable once the real
    // anchor has rendered, so a correction follows once it does.
    sessionStorage.setItem(FEED_SCROLL_STORAGE_KEY, JSON.stringify(makeAnchor({ shoutId: "z1", offsetFromTop: -15, approxItemsAbove: 4 })));
    let resolveFetch: (() => void) | null = null;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = () => resolve(jsonResponse({ shouts: [makeShout({ id: "z1" })], hasMore: false, nextCursor: null }));
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    const scrollToSpy = vi.fn();
    const scrollBySpy = vi.fn();
    vi.stubGlobal("scrollTo", scrollToSpy);
    vi.stubGlobal("scrollBy", scrollBySpy);
    vi.stubGlobal("innerHeight", 800);
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { cb(0); return 0; });
    const restoreRects = stubShoutTops({ z1: 100 }); // renders 100px below the target offset (-15)

    render(<ShoutFeed />, { wrapper });

    // Estimate: approxItemsAbove(4) * AVERAGE_CARD_HEIGHT_ESTIMATE_PX(150) + innerHeight(800) = 1400
    expect(scrollToSpy).toHaveBeenCalledWith(0, 1400);

    resolveFetch!();
    await screen.findByTestId("shout-z1");

    // Correction: scrollBy(currentTop - targetOffset) = 100 - (-15) = 115
    await vi.waitFor(() => expect(scrollBySpy).toHaveBeenCalledWith(0, 115));
    restoreRects();
  });

  it("reserves an estimated height via a placeholder while restoring, then swaps it for real content", async () => {
    sessionStorage.setItem(FEED_SCROLL_STORAGE_KEY, JSON.stringify(makeAnchor({ shoutId: "w1", approxItemsAbove: 3 })));
    mockFetchShouts([makeShout({ id: "w1" })]);
    vi.stubGlobal("innerHeight", 800);
    const restoreRects = stubShoutTops({ w1: 0 });

    render(<ShoutFeed />, { wrapper });

    const placeholder = screen.getByTestId("scroll-restore-placeholder");
    expect(placeholder.style.minHeight).toBe("1250px"); // 3 * 150 + 800
    expect(screen.queryByTestId("shout-w1")).not.toBeInTheDocument();

    await screen.findByTestId("shout-w1");
    expect(screen.queryByTestId("scroll-restore-placeholder")).not.toBeInTheDocument();
    restoreRects();
  });

  it("gives up after the search limit and lands at the top — not at the now-meaningless estimated position — when the anchor is never found (e.g. deleted)", async () => {
    sessionStorage.setItem(FEED_SCROLL_STORAGE_KEY, JSON.stringify(makeAnchor({ shoutId: "gone", offsetFromTop: -5, approxItemsAbove: 2 })));
    let page = 0;
    const fetchMock = vi.fn(() => {
      page++;
      return Promise.resolve(jsonResponse({ shouts: [makeShout({ id: `p${page}` })], hasMore: true, nextCursor: `c${page}` }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const scrollToSpy = vi.fn();
    vi.stubGlobal("scrollTo", scrollToSpy);

    render(<ShoutFeed />, { wrapper });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(8)); // ANCHOR_SEARCH_LIMIT_PAGES — never finds "gone"
    await screen.findByTestId("shout-p8");

    expect(sessionStorage.getItem(FEED_SCROLL_STORAGE_KEY)).toBeNull();
    await vi.waitFor(() => expect(scrollToSpy).toHaveBeenCalledWith(0, 0));
  });

  it("treats an old pixel-shaped sessionStorage entry (no `kind` field) as nothing to restore — normal fresh load, no error", async () => {
    sessionStorage.setItem(
      FEED_SCROLL_STORAGE_KEY,
      JSON.stringify({ scrollY: 999, count: 5, activeTab: "popular", popularSort: "comments" })
    );
    const fetchMock = vi.fn((_url: string) => Promise.resolve(jsonResponse({ shouts: [], hasMore: false, nextCursor: null })));
    vi.stubGlobal("fetch", fetchMock);

    render(<ShoutFeed />, { wrapper });
    await act(async () => {});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).not.toContain("sortBy=popular"); // defaulted to "new", not the stale "popular"
    expect(sessionStorage.getItem(FEED_SCROLL_STORAGE_KEY)).toBeNull();
  });

  it("falls back to a normal fresh load when there is nothing saved", async () => {
    const fetchMock = vi.fn((_url: string) =>
      Promise.resolve(jsonResponse({ shouts: [], hasMore: false, nextCursor: null }))
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<ShoutFeed />, { wrapper });
    await act(async () => {});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).not.toContain("sortBy=popular");
  });
});
