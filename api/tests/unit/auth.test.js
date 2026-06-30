import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Prisma client used by getRealtimeUserId's account-active check.
const findUnique = vi.hoisted(() => vi.fn());
vi.mock("../../src/db.js", () => ({ prisma: { user: { findUnique } } }));

import { hashPassword, verifyPassword, requireAuth, getRealtimeUserId } from "../../src/auth.js";

describe("hashPassword / verifyPassword", () => {
  it("hashPassword returns a bcrypt hash string", async () => {
    const hash = await hashPassword("secret");
    expect(hash).toMatch(/^\$2[aby]\$/);
  });

  it("verifyPassword returns true for the correct password", async () => {
    const hash = await hashPassword("mypassword");
    expect(await verifyPassword("mypassword", hash)).toBe(true);
  });

  it("verifyPassword returns false for a wrong password", async () => {
    const hash = await hashPassword("mypassword");
    expect(await verifyPassword("wrongpassword", hash)).toBe(false);
  });

  it("different calls produce different hashes (salted)", async () => {
    const h1 = await hashPassword("same");
    const h2 = await hashPassword("same");
    expect(h1).not.toBe(h2);
  });
});

describe("requireAuth", () => {
  it("calls next() when req.session.user is set", () => {
    const req = { session: { user: { id: "abc", name: "alice" } } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 401 JSON when session is null", () => {
    const req = { session: null };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 JSON when session exists but user is absent", () => {
    const req = { session: {} };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 JSON when req.session is undefined", () => {
    const req = {};
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("getRealtimeUserId", () => {
  beforeEach(() => {
    findUnique.mockReset();
  });

  it("returns null for an anonymous request (no session user)", async () => {
    expect(await getRealtimeUserId({ session: null })).toBeNull();
    expect(await getRealtimeUserId({ session: {} })).toBeNull();
    expect(await getRealtimeUserId({})).toBeNull();
    expect(findUnique).not.toHaveBeenCalled(); // short-circuits before DB
  });

  it("returns the user id for an active (non-banned) account", async () => {
    findUnique.mockResolvedValue({ is_banned: 0 });
    const req = { session: { user: { id: "u-active" } } };
    expect(await getRealtimeUserId(req)).toBe("u-active");
    expect(findUnique).toHaveBeenCalledWith({ where: { id: "u-active" }, select: { is_banned: true } });
  });

  it("returns null for a banned account", async () => {
    findUnique.mockResolvedValue({ is_banned: 1 });
    const req = { session: { user: { id: "u-banned" } } };
    expect(await getRealtimeUserId(req)).toBeNull();
  });

  it("returns null when the account no longer exists (deleted)", async () => {
    findUnique.mockResolvedValue(null);
    const req = { session: { user: { id: "u-gone" } } };
    expect(await getRealtimeUserId(req)).toBeNull();
  });
});
