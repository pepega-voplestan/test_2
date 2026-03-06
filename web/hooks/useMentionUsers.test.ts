import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// useMentionUsers holds module-level singletons (cachedUsers, fetchPromise).
// vi.resetModules() + dynamic import gives each test a fresh module instance.
describe("useMentionUsers", () => {
  let useMentionUsers: () => ReturnType<
    typeof import("./useMentionUsers")["useMentionUsers"]
  >;

  const mockUsers = [
    { id: "u1", name: "alice", avatar: "https://example.com/alice.webp" },
    { id: "u2", name: "bob", avatar: "https://example.com/bob.webp" },
  ];

  function mockFetchSuccess(users = mockUsers) {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ users }),
    } as Response);
  }

  function mockFetchHttpError() {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);
  }

  beforeEach(async () => {
    vi.stubGlobal("fetch", vi.fn());
    vi.resetModules();
    const mod = await import("./useMentionUsers");
    useMentionUsers = mod.useMentionUsers;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── Initial state ─────────────────────────────────────────────────────────

  it("starts with empty users, not loading, no error", () => {
    const { result } = renderHook(() => useMentionUsers());
    expect(result.current.users).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  // ── Successful fetch ──────────────────────────────────────────────────────

  it("fetchUsers sets loading=true then resolves with users", async () => {
    mockFetchSuccess();
    const { result } = renderHook(() => useMentionUsers());

    act(() => result.current.fetchUsers());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.users).toEqual(mockUsers);
    expect(result.current.error).toBeNull();
  });

  it("calls the correct API endpoint with credentials", async () => {
    mockFetchSuccess();
    const { result } = renderHook(() => useMentionUsers());
    act(() => result.current.fetchUsers());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(fetch).toHaveBeenCalledWith("/api/v1/users/mentions", {
      credentials: "include",
    });
  });

  // ── Error handling ────────────────────────────────────────────────────────

  it("sets error message on HTTP error response", async () => {
    mockFetchHttpError();
    const { result } = renderHook(() => useMentionUsers());

    act(() => result.current.fetchUsers());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("Не удалось загрузить пользователей");
    expect(result.current.users).toEqual([]);
  });

  it("sets error message on network failure", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"));
    const { result } = renderHook(() => useMentionUsers());

    act(() => result.current.fetchUsers());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("Не удалось загрузить пользователей");
  });

  // ── Module-level cache ────────────────────────────────────────────────────

  it("uses cached result on second call without re-fetching", async () => {
    mockFetchSuccess();
    const { result } = renderHook(() => useMentionUsers());

    // First call — network fetch
    act(() => result.current.fetchUsers());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetch).toHaveBeenCalledTimes(1);

    // Second call — cache hit, no additional fetch
    act(() => result.current.fetchUsers());
    await waitFor(() => expect(result.current.users).toEqual(mockUsers));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not set loading=true when cache is warm", async () => {
    mockFetchSuccess();
    const { result } = renderHook(() => useMentionUsers());

    act(() => result.current.fetchUsers());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Second call from cache — loading stays false
    act(() => result.current.fetchUsers());
    expect(result.current.loading).toBe(false);
  });

  it("allows a retry after an error (fetchPromise is cleared)", async () => {
    mockFetchHttpError();
    const { result } = renderHook(() => useMentionUsers());

    act(() => result.current.fetchUsers());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();

    // Second attempt should re-fetch (fetchPromise was cleared in .catch)
    mockFetchSuccess();
    act(() => result.current.fetchUsers());
    await waitFor(() => expect(result.current.users).toEqual(mockUsers));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  // ── Promise deduplication ─────────────────────────────────────────────────

  it("deduplicates concurrent calls (only one network request for overlapping calls)", async () => {
    // Resolve once — both concurrent calls should get the same result
    mockFetchSuccess();
    const { result: r1 } = renderHook(() => useMentionUsers());
    const { result: r2 } = renderHook(() => useMentionUsers());

    act(() => {
      r1.current.fetchUsers();
      r2.current.fetchUsers();
    });

    await waitFor(() => expect(r1.current.loading).toBe(false));
    await waitFor(() => expect(r2.current.loading).toBe(false));

    // Only one real network request despite two concurrent callers
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(r1.current.users).toEqual(mockUsers);
    expect(r2.current.users).toEqual(mockUsers);
  });
});
