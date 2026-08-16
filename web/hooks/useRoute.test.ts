import { renderHook, act } from "@testing-library/react";
import { useRoute, navigateTo, goBack } from "./useRoute";

// useRoute.ts sets window.history.scrollRestoration = "manual" at module
// load, guarded by a "scrollRestoration" in window.history feature check —
// not covered by a test here because jsdom doesn't implement the property
// at all (it's simply absent, so the guard correctly no-ops), leaving
// nothing meaningful to assert in this environment.

describe("useRoute", () => {
  afterEach(() => {
    history.replaceState(null, "", "/");
  });

  it("returns feed route by default", () => {
    history.replaceState(null, "", "/");
    const { result } = renderHook(() => useRoute());
    expect(result.current).toEqual({ page: "feed" });
  });

  it("parses profile route", () => {
    history.replaceState(null, "", "/profile/abc-123");
    const { result } = renderHook(() => useRoute());
    expect(result.current).toEqual({ page: "profile", userId: "abc-123" });
  });

  it("parses shout route", () => {
    history.replaceState(null, "", "/shout/def-456");
    const { result } = renderHook(() => useRoute());
    expect(result.current).toEqual({ page: "shout", shoutId: "def-456" });
  });

  it("parses shout route with comment query param", () => {
    history.replaceState(null, "", "/shout/def-456?comment=c-789");
    const { result } = renderHook(() => useRoute());
    expect(result.current).toEqual({ page: "shout", shoutId: "def-456", commentId: "c-789" });
  });

  it("falls back to feed for unknown path", () => {
    history.replaceState(null, "", "/unknown/path");
    const { result } = renderHook(() => useRoute());
    expect(result.current).toEqual({ page: "feed" });
  });

  it("reacts to popstate events", () => {
    history.replaceState(null, "", "/");
    const { result } = renderHook(() => useRoute());
    expect(result.current).toEqual({ page: "feed" });

    act(() => {
      history.replaceState(null, "", "/profile/user-1");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(result.current).toEqual({ page: "profile", userId: "user-1" });
  });

  it("migrates legacy hash URLs to clean paths", () => {
    window.location.hash = "#/profile/old-user";
    const { result } = renderHook(() => useRoute());
    expect(result.current).toEqual({ page: "profile", userId: "old-user" });
    expect(window.location.hash).toBe("");
  });
});

describe("navigateTo", () => {
  afterEach(() => {
    history.replaceState(null, "", "/");
  });

  it("updates the URL path via pushState", () => {
    navigateTo("/shout/test-id");
    expect(window.location.pathname).toBe("/shout/test-id");
  });

  it("triggers route update in useRoute", () => {
    history.replaceState(null, "", "/");
    const { result } = renderHook(() => useRoute());
    expect(result.current).toEqual({ page: "feed" });

    act(() => {
      navigateTo("/profile/nav-user");
    });

    expect(result.current).toEqual({ page: "profile", userId: "nav-user" });
  });
});

describe("goBack", () => {
  afterEach(() => {
    history.replaceState(null, "", "/");
  });

  it("calls history.back() when the current entry was reached via navigateTo", () => {
    navigateTo("/shout/test-id"); // pushes { inApp: true }
    const backSpy = vi.spyOn(history, "back").mockImplementation(() => {});
    const pushSpy = vi.spyOn(history, "pushState");

    goBack();

    expect(backSpy).toHaveBeenCalledTimes(1);
    expect(pushSpy).not.toHaveBeenCalled();
    backSpy.mockRestore();
    pushSpy.mockRestore();
  });

  it("falls back to navigating to the feed when there is no in-app history (e.g. a direct/shared link)", () => {
    // No prior navigateTo call — simulates landing directly on a permalink.
    history.replaceState(null, "", "/shout/test-id");
    const backSpy = vi.spyOn(history, "back").mockImplementation(() => {});

    goBack();

    expect(backSpy).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/");
    backSpy.mockRestore();
  });
});
