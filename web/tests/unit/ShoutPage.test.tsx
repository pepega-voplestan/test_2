import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { screen, act, render } from "@testing-library/react";
import ShoutPage from "../../components/ShoutPage";
import { SSEProvider } from "../../context/SSEContext";
import { ContentPreferencesProvider } from "../../context/ContentPreferencesContext";
import type { Shout } from "../../types";

const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock("../../context/AuthContext", () => ({ useAuth: () => mockUseAuth() }));

vi.mock("../../components/ShoutCard", () => ({
  default: ({ shout, onDelete }: { shout: Shout; onDelete?: (id: string) => void }) => (
    <div data-testid="shout-card">
      {shout.isDeleted ? "DELETED_PLACEHOLDER" : shout.content}
      <button onClick={() => onDelete?.(shout.id)}>delete</button>
    </div>
  ),
}));

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

function mockFetchShout(shout: Shout) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ shout }),
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
  mockUseAuth.mockReturnValue({ user: { id: "me", name: "me", avatar: "" }, loading: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ShoutPage — remove_shout / delete_shout handling", () => {
  it("transitions to the not-found state on a remove_shout SSE event from another user", async () => {
    const shout = makeShout({ id: "s1", comments: [] });
    mockFetchShout(shout);

    render(<ShoutPage shoutId="s1" />, { wrapper });
    await screen.findByTestId("shout-card");

    const es = MockEventSource.instances[0];
    act(() => es.triggerMessage("remove_shout", { shoutId: "s1", userId: "other-user" }));

    expect(screen.queryByTestId("shout-card")).not.toBeInTheDocument();
    expect(screen.getByText("Запись не найдена")).toBeInTheDocument();
  });

  it("keeps the placeholder behavior unchanged for a delete_shout SSE event from another user", async () => {
    const shout = makeShout({ id: "s2", content: "Has a comment", comments: [{ id: "c1" } as never] });
    mockFetchShout(shout);

    render(<ShoutPage shoutId="s2" />, { wrapper });
    await screen.findByTestId("shout-card");

    const es = MockEventSource.instances[0];
    act(() => es.triggerMessage("delete_shout", { shoutId: "s2", userId: "other-user" }));

    expect(screen.getByTestId("shout-card")).toHaveTextContent("DELETED_PLACEHOLDER");
  });
});

describe("ShoutPage — handleDelete (author's own delete callback)", () => {
  it("transitions to the not-found state when the shout has zero comments", async () => {
    const shout = makeShout({ id: "s3", comments: [] });
    mockFetchShout(shout);

    render(<ShoutPage shoutId="s3" />, { wrapper });
    const card = await screen.findByTestId("shout-card");

    act(() => card.querySelector("button")!.click());

    expect(screen.queryByTestId("shout-card")).not.toBeInTheDocument();
    expect(screen.getByText("Запись не найдена")).toBeInTheDocument();
  });

  it("falls back to the placeholder patch when the shout has comments (unchanged behavior)", async () => {
    const shout = makeShout({ id: "s4", content: "Has a comment", comments: [{ id: "c1" } as never] });
    mockFetchShout(shout);

    render(<ShoutPage shoutId="s4" />, { wrapper });
    const card = await screen.findByTestId("shout-card");

    act(() => card.querySelector("button")!.click());

    expect(screen.getByTestId("shout-card")).toHaveTextContent("DELETED_PLACEHOLDER");
  });
});
