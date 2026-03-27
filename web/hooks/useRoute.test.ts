import { renderHook, act } from "@testing-library/react";
import { useRoute, navigateTo } from "./useRoute";

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
