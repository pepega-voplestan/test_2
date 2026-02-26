import { renderHook, act } from "@testing-library/react";
import { useRoute, navigateTo } from "./useRoute";

describe("useRoute", () => {
  afterEach(() => {
    window.location.hash = "";
  });

  it("returns feed route by default", () => {
    window.location.hash = "";
    const { result } = renderHook(() => useRoute());
    expect(result.current).toEqual({ page: "feed" });
  });

  it("parses profile route", () => {
    window.location.hash = "#/profile/abc-123";
    const { result } = renderHook(() => useRoute());
    expect(result.current).toEqual({ page: "profile", userId: "abc-123" });
  });

  it("parses shout route", () => {
    window.location.hash = "#/shout/def-456";
    const { result } = renderHook(() => useRoute());
    expect(result.current).toEqual({ page: "shout", shoutId: "def-456" });
  });

  it("falls back to feed for unknown hash", () => {
    window.location.hash = "#/unknown/path";
    const { result } = renderHook(() => useRoute());
    expect(result.current).toEqual({ page: "feed" });
  });

  it("reacts to hashchange events", () => {
    window.location.hash = "";
    const { result } = renderHook(() => useRoute());
    expect(result.current).toEqual({ page: "feed" });

    act(() => {
      window.location.hash = "#/profile/user-1";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });

    expect(result.current).toEqual({ page: "profile", userId: "user-1" });
  });
});

describe("navigateTo", () => {
  afterEach(() => {
    window.location.hash = "";
  });

  it("sets window.location.hash", () => {
    navigateTo("#/shout/test-id");
    expect(window.location.hash).toBe("#/shout/test-id");
  });
});
