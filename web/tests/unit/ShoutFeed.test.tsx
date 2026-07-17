import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { screen, act, render } from "@testing-library/react";
import ShoutFeed from "../../components/ShoutFeed";
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

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ContentPreferencesProvider>
      <SSEProvider>{children}</SSEProvider>
    </ContentPreferencesProvider>
  );
}

beforeEach(() => {
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
