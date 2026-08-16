import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, act, render } from "@testing-library/react";
import ProfilePage, { PROFILE_SCROLL_STORAGE_KEY } from "../../components/ProfilePage";
import type { Shout } from "../../types";

// Mocked directly (same pattern as ShoutFeed.test.tsx's AuthContext mock) —
// this suite only exercises ProfilePage's own scroll-restore state logic,
// not any of these contexts' real behavior.
const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock("../../context/AuthContext", () => ({ useAuth: () => mockUseAuth() }));
const mockUseTheme = vi.hoisted(() => vi.fn());
vi.mock("../../context/ThemeContext", () => ({ useTheme: () => mockUseTheme() }));
const mockUseContentPreferences = vi.hoisted(() => vi.fn());
vi.mock("../../context/ContentPreferencesContext", () => ({ useContentPreferences: () => mockUseContentPreferences() }));
const mockUseIgnoredUsers = vi.hoisted(() => vi.fn());
vi.mock("../../context/IgnoredUsersContext", () => ({ useIgnoredUsers: () => mockUseIgnoredUsers() }));

vi.mock("../../components/ShoutCard", () => ({
  default: ({ shout }: { shout: Shout }) => (
    <div data-testid={`shout-${shout.id}`}>{shout.content}</div>
  ),
}));
vi.mock("../../components/AvatarUpload", () => ({ default: () => null }));
vi.mock("../../components/Lightbox", () => ({ default: () => null }));
vi.mock("../../components/ProfileSocials", () => ({
  ProfileSocialsDisplay: () => null,
  ProfileSocialsEditor: () => null,
}));

const PROFILE_ID = "user-1";

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

function jsonResponse(body: unknown): Response {
  return { ok: true, json: async () => body } as Response;
}

function mockProfileFetch(shouts: Shout[], opts: { hasMore?: boolean } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.includes("/socials")) return Promise.resolve(jsonResponse({ socials: [] }));
      if (url.includes("/shouts")) return Promise.resolve(jsonResponse({ shouts, hasMore: !!opts.hasMore }));
      return Promise.resolve(
        jsonResponse({
          profile: {
            id: PROFILE_ID,
            name: "Bob",
            avatar: "",
            isOwner: false,
            shoutCount: shouts.length,
            createdAt: new Date().toISOString(),
          },
        })
      );
    })
  );
}

function makeAnchor(
  overrides: Partial<{ userId: string; shoutId: string; offsetFromTop: number; approxItemsAbove: number }> = {}
) {
  return {
    kind: "profile-anchor" as const,
    userId: PROFILE_ID,
    shoutId: "a1",
    offsetFromTop: 0,
    approxItemsAbove: 0,
    ...overrides,
  };
}

// Same approach as ShoutFeed.test.tsx: stubs getBoundingClientRect so the
// anchor-detection effect (which measures each shout wrapper div) sees a
// controlled `top` per shout, matched via the mocked ShoutCard's own
// data-testid.
function stubShoutTops(topsByShoutId: Record<string, number>) {
  const spy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const child = this.querySelector('[data-testid^="shout-"]');
    const shoutId = child?.getAttribute("data-testid")?.replace("shout-", "");
    const top = shoutId && shoutId in topsByShoutId ? topsByShoutId[shoutId] : 0;
    return { top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top, toJSON: () => {} } as DOMRect;
  });
  return () => spy.mockRestore();
}

beforeEach(() => {
  sessionStorage.clear();
  mockUseAuth.mockReturnValue({ user: { id: "me", name: "me", avatar: "" }, refresh: vi.fn() });
  mockUseTheme.mockReturnValue({ theme: "dark", toggle: vi.fn() });
  mockUseContentPreferences.mockReturnValue({ prefs: { showMedia: true }, setShowMedia: vi.fn() });
  mockUseIgnoredUsers.mockReturnValue({
    isIgnored: () => false,
    addIgnoredUser: vi.fn(),
    removeIgnoredUser: vi.fn(),
    ignoredUserIds: [],
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ProfilePage — anchor-based scroll restore within a profile's own shout list (issue #2)", () => {
  it("saves the topmost anchor shout, tagged with THIS profile's userId, on unmount", async () => {
    mockProfileFetch([makeShout({ id: "r1" }), makeShout({ id: "r2" })]);
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    const restoreRects = stubShoutTops({ r1: -30, r2: 300 });

    const { unmount } = render(<ProfilePage userId={PROFILE_ID} />);
    await screen.findByTestId("shout-r2");
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });

    unmount();
    restoreRects();

    const saved = JSON.parse(sessionStorage.getItem(PROFILE_SCROLL_STORAGE_KEY)!);
    expect(saved).toEqual(makeAnchor({ shoutId: "r1", offsetFromTop: -30, approxItemsAbove: 0 }));
  });

  it('ignores a saved anchor for a DIFFERENT profile — restoration is scoped "ONLY IF IN PROFILE"', async () => {
    sessionStorage.setItem(
      PROFILE_SCROLL_STORAGE_KEY,
      JSON.stringify(makeAnchor({ userId: "someone-else", shoutId: "a1" }))
    );
    mockProfileFetch([makeShout({ id: "fresh1" })]);

    render(<ProfilePage userId={PROFILE_ID} />);
    await screen.findByTestId("shout-fresh1");

    expect(screen.queryByTestId("profile-scroll-restore-placeholder")).not.toBeInTheDocument();
  });

  it("restores to the remembered shout when the saved userId matches this profile, clearing the entry once done", async () => {
    sessionStorage.setItem(PROFILE_SCROLL_STORAGE_KEY, JSON.stringify(makeAnchor({ shoutId: "a1" })));
    mockProfileFetch([makeShout({ id: "a1" })]);

    render(<ProfilePage userId={PROFILE_ID} />);
    await screen.findByTestId("shout-a1");

    expect(sessionStorage.getItem(PROFILE_SCROLL_STORAGE_KEY)).toBeNull();
  });

  it("scrolls to an estimated position immediately, then corrects once the anchor shout actually renders", async () => {
    sessionStorage.setItem(
      PROFILE_SCROLL_STORAGE_KEY,
      JSON.stringify(makeAnchor({ shoutId: "z1", offsetFromTop: -15, approxItemsAbove: 2 }))
    );
    let resolveFetch: (() => void) | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/socials")) return Promise.resolve(jsonResponse({ socials: [] }));
        if (url.includes("/shouts")) {
          return new Promise<Response>((resolve) => {
            resolveFetch = () => resolve(jsonResponse({ shouts: [makeShout({ id: "z1" })], hasMore: false }));
          });
        }
        return Promise.resolve(
          jsonResponse({ profile: { id: PROFILE_ID, name: "Bob", avatar: "", isOwner: false, shoutCount: 1, createdAt: new Date().toISOString() } })
        );
      })
    );
    const scrollToSpy = vi.fn();
    const scrollBySpy = vi.fn();
    vi.stubGlobal("scrollTo", scrollToSpy);
    vi.stubGlobal("scrollBy", scrollBySpy);
    vi.stubGlobal("innerHeight", 800);
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    const restoreRects = stubShoutTops({ z1: 100 }); // renders 100px below the target offset (-15)

    render(<ProfilePage userId={PROFILE_ID} />);
    await screen.findByText("Bob"); // profile loaded, shouts fetch now in flight

    // Estimate: approxItemsAbove(2) * 150 + innerHeight(800) = 1100
    expect(scrollToSpy).toHaveBeenCalledWith(0, 1100);

    resolveFetch!();
    await screen.findByTestId("shout-z1");

    // Correction: scrollBy(currentTop - targetOffset) = 100 - (-15) = 115
    await vi.waitFor(() => expect(scrollBySpy).toHaveBeenCalledWith(0, 115));
    restoreRects();
  });
});
