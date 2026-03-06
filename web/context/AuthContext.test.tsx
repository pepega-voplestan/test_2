import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "./AuthContext";

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

const mockUser = { id: "u1", name: "alice", avatar: "avatar.webp" };

/** Queue a successful fetch response. */
function mockOk(body: unknown) {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(body),
  } as Response);
}

/** Queue a failed fetch response with a JSON error body. */
function mockErr(status: number, error: string) {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: false,
    status,
    json: () => Promise.resolve({ error }),
  } as Response);
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  // Default: /api/v1/me returns no active session
  mockOk({ user: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Initial load ──────────────────────────────────────────────────────────────

describe("AuthContext — initial load", () => {
  it("starts in loading state and ends with user=null when not logged in", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
  });

  it("sets user from /api/v1/me when a session exists", async () => {
    vi.mocked(fetch).mockReset();
    mockOk({ user: mockUser });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toEqual(mockUser);
  });

  it("sets user=null and clears loading when /api/v1/me fails", async () => {
    vi.mocked(fetch).mockReset();
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
  });

  it("calls /api/v1/me on mount", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetch).toHaveBeenCalledWith("/api/v1/me", expect.anything());
  });
});

// ── login ─────────────────────────────────────────────────────────────────────

describe("AuthContext — login", () => {
  it("sets user and closes the modal on success", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.openModal());
    expect(result.current.isAuthModalOpen).toBe(true);

    mockOk({ user: mockUser });
    await act(() => result.current.login("alice", "pass"));

    expect(result.current.user).toEqual(mockUser);
    expect(result.current.isAuthModalOpen).toBe(false);
  });

  it("posts to /api/v1/auth/login with the provided credentials", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockOk({ user: mockUser });
    await act(() => result.current.login("alice", "secret"));

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/auth/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ login: "alice", password: "secret" }),
      })
    );
  });

  it("throws on failure without changing user or closing modal", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.openModal());
    mockErr(401, "Invalid credentials");

    await expect(
      act(() => result.current.login("alice", "wrong"))
    ).rejects.toThrow("Invalid credentials");

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthModalOpen).toBe(true);
  });
});

// ── logout ────────────────────────────────────────────────────────────────────

describe("AuthContext — logout", () => {
  it("sets user to null", async () => {
    // Start logged in
    vi.mocked(fetch).mockReset();
    mockOk({ user: mockUser });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user).toEqual(mockUser));

    mockOk({});
    await act(() => result.current.logout());

    expect(result.current.user).toBeNull();
  });

  it("posts to /api/v1/auth/logout", async () => {
    vi.mocked(fetch).mockReset();
    mockOk({ user: mockUser });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user).toEqual(mockUser));

    mockOk({});
    await act(() => result.current.logout());

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/auth/logout",
      expect.objectContaining({ method: "POST" })
    );
  });
});

// ── registerSendCode ──────────────────────────────────────────────────────────

describe("AuthContext — registerSendCode", () => {
  it("calls the send-code endpoint without changing auth state", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockOk({ ok: true });
    await act(() =>
      result.current.registerSendCode("alice", "pass", "alice@test.com")
    );

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/auth/register/send-code",
      expect.objectContaining({ method: "POST" })
    );
    expect(result.current.user).toBeNull();
  });
});

// ── registerVerify ────────────────────────────────────────────────────────────

describe("AuthContext — registerVerify", () => {
  it("sets user and closes modal on success", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.openModal());
    mockOk({ user: mockUser });
    await act(() => result.current.registerVerify("alice@test.com", "123456"));

    expect(result.current.user).toEqual(mockUser);
    expect(result.current.isAuthModalOpen).toBe(false);
  });
});

// ── forgotPasswordSendCode ────────────────────────────────────────────────────

describe("AuthContext — forgotPasswordSendCode", () => {
  it("calls the forgot-password/send-code endpoint", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockOk({ ok: true });
    await act(() => result.current.forgotPasswordSendCode("alice@test.com"));

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/auth/forgot-password/send-code",
      expect.objectContaining({ method: "POST" })
    );
  });
});

// ── forgotPasswordReset ───────────────────────────────────────────────────────

describe("AuthContext — forgotPasswordReset", () => {
  it("sets user and closes modal on success", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.openModal());
    mockOk({ user: mockUser });
    await act(() =>
      result.current.forgotPasswordReset("alice@test.com", "123456", "newpass")
    );

    expect(result.current.user).toEqual(mockUser);
    expect(result.current.isAuthModalOpen).toBe(false);
  });
});

// ── Modal helpers ─────────────────────────────────────────────────────────────

describe("AuthContext — modal", () => {
  it("openModal sets isAuthModalOpen=true", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.openModal());
    expect(result.current.isAuthModalOpen).toBe(true);
  });

  it("closeModal sets isAuthModalOpen=false", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.openModal());
    act(() => result.current.closeModal());
    expect(result.current.isAuthModalOpen).toBe(false);
  });
});

// ── api() error handling ──────────────────────────────────────────────────────

describe("AuthContext — api() error messages", () => {
  it("uses the server error message from response JSON", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockErr(422, "Имя пользователя уже занято");
    await expect(
      act(() => result.current.registerVerify("e@e.com", "000000"))
    ).rejects.toThrow("Имя пользователя уже занято");
  });

  it("falls back to a generic message when response has no error field", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}), // no error field
    } as Response);

    await expect(
      act(() => result.current.login("u", "p"))
    ).rejects.toThrow("Что-то пошло не так");
  });
});

// ── Guard ─────────────────────────────────────────────────────────────────────

describe("AuthContext — guard", () => {
  it("throws when useAuth is called outside AuthProvider", () => {
    expect(() => renderHook(() => useAuth())).toThrow(
      "useAuth must be used within"
    );
  });
});
