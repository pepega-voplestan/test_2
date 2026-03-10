import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { IgnoredUsersProvider, useIgnoredUsers } from "./IgnoredUsersContext";

// Mock useAuth
const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock("./AuthContext", () => ({ useAuth: () => mockUseAuth() }));

function wrapper({ children }: { children: React.ReactNode }) {
  return <IgnoredUsersProvider>{children}</IgnoredUsersProvider>;
}

beforeEach(() => {
  vi.restoreAllMocks();
  mockUseAuth.mockReturnValue({ user: null });
});

describe("IgnoredUsersContext — no user", () => {
  it("returns empty list when not logged in", () => {
    const { result } = renderHook(() => useIgnoredUsers(), { wrapper });
    expect(result.current.ignoredUserIds).toEqual([]);
  });

  it("isIgnored returns false when not logged in", () => {
    const { result } = renderHook(() => useIgnoredUsers(), { wrapper });
    expect(result.current.isIgnored("user-1")).toBe(false);
  });
});

describe("IgnoredUsersContext — logged in", () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      user: { id: "me", name: "me", avatar: "" },
    });
  });

  it("fetches ignored users on mount", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ userIds: ["u1", "u2"] }), { status: 200 })
    );

    const { result } = renderHook(() => useIgnoredUsers(), { wrapper });

    await waitFor(() => {
      expect(result.current.ignoredUserIds).toEqual(["u1", "u2"]);
    });

    expect(fetchSpy).toHaveBeenCalledWith("/api/v1/me/ignored-users", expect.objectContaining({ credentials: "include" }));
  });

  it("isIgnored returns true for ignored user", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ userIds: ["u1"] }), { status: 200 })
    );

    const { result } = renderHook(() => useIgnoredUsers(), { wrapper });

    await waitFor(() => {
      expect(result.current.isIgnored("u1")).toBe(true);
    });
    expect(result.current.isIgnored("u2")).toBe(false);
  });

  it("addIgnoredUser calls POST and refreshes", async () => {
    let callCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/me/ignored-users")) {
        callCount++;
        const ids = callCount > 1 ? ["u1"] : [];
        return new Response(JSON.stringify({ userIds: ids }), { status: 200 });
      }
      if (urlStr.includes("/ignore")) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    });

    const { result } = renderHook(() => useIgnoredUsers(), { wrapper });

    await waitFor(() => expect(result.current.ignoredUserIds).toEqual([]));

    await act(async () => {
      await result.current.addIgnoredUser("u1");
    });

    await waitFor(() => {
      expect(result.current.ignoredUserIds).toEqual(["u1"]);
    });
  });

  it("removeIgnoredUser calls DELETE and refreshes", async () => {
    let callCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/me/ignored-users")) {
        callCount++;
        const ids = callCount <= 1 ? ["u1"] : [];
        return new Response(JSON.stringify({ userIds: ids }), { status: 200 });
      }
      if (urlStr.includes("/ignore")) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    });

    const { result } = renderHook(() => useIgnoredUsers(), { wrapper });

    await waitFor(() => expect(result.current.ignoredUserIds).toEqual(["u1"]));

    await act(async () => {
      await result.current.removeIgnoredUser("u1");
    });

    await waitFor(() => {
      expect(result.current.ignoredUserIds).toEqual([]);
    });
  });

  it("addIgnoredUser throws on error response", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/me/ignored-users")) {
        return new Response(JSON.stringify({ userIds: [] }), { status: 200 });
      }
      if (urlStr.includes("/ignore")) {
        return new Response(JSON.stringify({ error: "Список игнора заполнен" }), { status: 400 });
      }
      return new Response("{}", { status: 404 });
    });

    const { result } = renderHook(() => useIgnoredUsers(), { wrapper });
    await waitFor(() => expect(result.current.ignoredUserIds).toEqual([]));

    await expect(
      act(async () => {
        await result.current.addIgnoredUser("u1");
      })
    ).rejects.toThrow("Список игнора заполнен");
  });

  it("clears ignored list on logout", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ userIds: ["u1"] }), { status: 200 })
    );

    const { result, rerender } = renderHook(() => useIgnoredUsers(), { wrapper });
    await waitFor(() => expect(result.current.ignoredUserIds).toEqual(["u1"]));

    // Simulate logout
    mockUseAuth.mockReturnValue({ user: null });
    rerender();

    await waitFor(() => {
      expect(result.current.ignoredUserIds).toEqual([]);
    });
  });
});

describe("IgnoredUsersContext — guard", () => {
  it("throws when used outside provider", () => {
    expect(() => renderHook(() => useIgnoredUsers())).toThrow(
      "useIgnoredUsers must be used within"
    );
  });
});
