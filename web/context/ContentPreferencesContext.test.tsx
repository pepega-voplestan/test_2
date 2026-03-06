import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import {
  ContentPreferencesProvider,
  useContentPreferences,
} from "./ContentPreferencesContext";

// ── Mock useAuth so tests don't need a real AuthProvider or fetch ──────────────

const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock("./AuthContext", () => ({ useAuth: () => mockUseAuth() }));

function wrapper({ children }: { children: React.ReactNode }) {
  return <ContentPreferencesProvider>{children}</ContentPreferencesProvider>;
}

const STORAGE_KEY = "content_preferences";
const DEFAULTS = { showMedia: true, showNsfw: false, showPolitics: false };

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY);
  mockUseAuth.mockReturnValue({ user: null });
});

describe("ContentPreferencesContext — defaults", () => {
  it("uses DEFAULTS when localStorage is empty", () => {
    const { result } = renderHook(() => useContentPreferences(), { wrapper });
    expect(result.current.prefs).toEqual(DEFAULTS);
  });

  it("falls back to DEFAULTS on invalid JSON in localStorage", () => {
    localStorage.setItem(STORAGE_KEY, "{bad json");
    const { result } = renderHook(() => useContentPreferences(), { wrapper });
    expect(result.current.prefs).toEqual(DEFAULTS);
  });
});

describe("ContentPreferencesContext — localStorage loading", () => {
  it("reads showMedia=false from localStorage", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ showMedia: false }));
    const { result } = renderHook(() => useContentPreferences(), { wrapper });
    expect(result.current.prefs.showMedia).toBe(false);
  });

  it("uses default for non-boolean stored values", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ showMedia: "yes", showNsfw: 1 })
    );
    const { result } = renderHook(() => useContentPreferences(), { wrapper });
    // Non-booleans fall back to the field default
    expect(result.current.prefs.showMedia).toBe(DEFAULTS.showMedia);
    expect(result.current.prefs.showNsfw).toBe(DEFAULTS.showNsfw);
  });
});

describe("ContentPreferencesContext — user login/logout sync", () => {
  it("merges showNsfw and showPolitics from the user object on login", async () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: "u1",
        name: "alice",
        avatar: "",
        showNsfw: true,
        showPolitics: true,
      },
    });
    const { result } = renderHook(() => useContentPreferences(), { wrapper });
    await waitFor(() => {
      expect(result.current.prefs.showNsfw).toBe(true);
      expect(result.current.prefs.showPolitics).toBe(true);
    });
  });

  it("preserves local showMedia value when user logs in", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ showMedia: false }));
    mockUseAuth.mockReturnValue({
      user: { id: "u1", name: "alice", avatar: "", showNsfw: false, showPolitics: false },
    });
    const { result } = renderHook(() => useContentPreferences(), { wrapper });
    await waitFor(() => {
      expect(result.current.prefs.showMedia).toBe(false);
    });
  });

  it("reverts showNsfw/showPolitics to localStorage defaults on logout", async () => {
    // Start logged in with nsfw=true
    mockUseAuth.mockReturnValue({
      user: { id: "u1", name: "alice", avatar: "", showNsfw: true, showPolitics: true },
    });
    const { result, rerender } = renderHook(() => useContentPreferences(), {
      wrapper,
    });
    await waitFor(() => expect(result.current.prefs.showNsfw).toBe(true));

    // Log out
    mockUseAuth.mockReturnValue({ user: null });
    rerender();

    await waitFor(() => {
      expect(result.current.prefs.showNsfw).toBe(false); // back to default
      expect(result.current.prefs.showPolitics).toBe(false);
    });
  });

  it("uses default for missing boolean fields on the user object", async () => {
    mockUseAuth.mockReturnValue({
      user: { id: "u1", name: "alice", avatar: "" }, // no showNsfw/showPolitics
    });
    const { result } = renderHook(() => useContentPreferences(), { wrapper });
    await waitFor(() => {
      expect(result.current.prefs.showNsfw).toBe(DEFAULTS.showNsfw);
      expect(result.current.prefs.showPolitics).toBe(DEFAULTS.showPolitics);
    });
  });
});

describe("ContentPreferencesContext — setters", () => {
  it("setShowMedia updates prefs and persists to localStorage", () => {
    const { result } = renderHook(() => useContentPreferences(), { wrapper });

    act(() => result.current.setShowMedia(false));

    expect(result.current.prefs.showMedia).toBe(false);
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.showMedia).toBe(false);
  });

  it("setShowNsfw updates prefs state", () => {
    const { result } = renderHook(() => useContentPreferences(), { wrapper });
    act(() => result.current.setShowNsfw(true));
    expect(result.current.prefs.showNsfw).toBe(true);
  });

  it("setShowPolitics updates prefs state", () => {
    const { result } = renderHook(() => useContentPreferences(), { wrapper });
    act(() => result.current.setShowPolitics(true));
    expect(result.current.prefs.showPolitics).toBe(true);
  });

  it("setters only change the targeted field", () => {
    const { result } = renderHook(() => useContentPreferences(), { wrapper });
    act(() => result.current.setShowNsfw(true));
    expect(result.current.prefs.showMedia).toBe(DEFAULTS.showMedia);
    expect(result.current.prefs.showPolitics).toBe(DEFAULTS.showPolitics);
  });
});

describe("ContentPreferencesContext — guard", () => {
  it("throws when used outside ContentPreferencesProvider", () => {
    expect(() => renderHook(() => useContentPreferences())).toThrow(
      "useContentPreferences must be used within"
    );
  });
});
