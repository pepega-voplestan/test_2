import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import bcrypt from "bcryptjs";
import supertest from "supertest";
import { request, getApp, cleanDb, disconnectDb, getTestPrisma } from "../helpers.js";
import { createUser, createVerificationCode } from "../fixtures/index.js";

describe("Auth routes", () => {
  beforeEach(async () => {
    await cleanDb();
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await cleanDb();
    await disconnectDb();
  });

  // ── POST /api/v1/auth/register/send-code ─────────────────────────────────

  describe("POST /api/v1/auth/register/send-code", () => {
    it("returns 400 for invalid email", async () => {
      const res = await (await request())
        .post("/api/v1/auth/register/send-code")
        .send({ username: "alice", password: "pass123", email: "not-an-email" });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/email/i);
    });

    it("returns 400 for username shorter than 3 chars", async () => {
      const res = await (await request())
        .post("/api/v1/auth/register/send-code")
        .send({ username: "ab", password: "pass123", email: "ab@test.local" });
      expect(res.status).toBe(400);
    });

    it("returns 400 for password shorter than 6 chars", async () => {
      const res = await (await request())
        .post("/api/v1/auth/register/send-code")
        .send({ username: "alice", password: "short", email: "alice@test.local" });
      expect(res.status).toBe(400);
    });

    it("returns 409 when username is already taken", async () => {
      await createUser({ username: "alice", email: "alice@test.local" });
      const res = await (await request())
        .post("/api/v1/auth/register/send-code")
        .send({ username: "alice", password: "pass123", email: "other@test.local" });
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/имя пользователя/i);
    });

    it("returns 409 when email is already taken", async () => {
      await createUser({ username: "alice", email: "alice@test.local" });
      const res = await (await request())
        .post("/api/v1/auth/register/send-code")
        .send({ username: "newuser", password: "pass123", email: "alice@test.local" });
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/email/i);
    });

    it("returns 200 and creates a verification code record for valid data", async () => {
      const res = await (await request())
        .post("/api/v1/auth/register/send-code")
        .send({ username: "alice", password: "pass123", email: "alice@test.local" });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      // Verification code should exist in DB
      const prisma = getTestPrisma();
      const code = await prisma.verificationCode.findFirst({
        where: { email: "alice@test.local", purpose: "register", used: 0 },
      });
      expect(code).not.toBeNull();
      expect(code.payload).toContain("alice");
    });
  });

  // ── POST /api/v1/auth/register/verify ────────────────────────────────────

  describe("POST /api/v1/auth/register/verify", () => {
    it("returns 400 when no unused code exists", async () => {
      const res = await (await request())
        .post("/api/v1/auth/register/verify")
        .send({ email: "nobody@test.local", code: "123456" });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/код не найден/i);
    });

    it("returns 400 for an expired code", async () => {
      const expiredAt = new Date(Date.now() - 1_000).toISOString();
      await createVerificationCode({
        email: "alice@test.local",
        code: "111111",
        purpose: "register",
        expires_at: expiredAt,
        payload: JSON.stringify({ username: "alice", password_hash: "x", avatar: "y" }),
      });

      const res = await (await request())
        .post("/api/v1/auth/register/verify")
        .send({ email: "alice@test.local", code: "111111" });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/истёк/i);
    });

    it("returns 400 when max attempts are exceeded", async () => {
      await createVerificationCode({
        email: "alice@test.local",
        code: "222222",
        purpose: "register",
        attempts: 5, // CODE_MAX_ATTEMPTS = 5
        payload: JSON.stringify({ username: "alice", password_hash: "x", avatar: "y" }),
      });

      const res = await (await request())
        .post("/api/v1/auth/register/verify")
        .send({ email: "alice@test.local", code: "222222" });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/попыток/i);
    });

    it("returns 400 for a wrong code and shows remaining attempts", async () => {
      await createVerificationCode({
        email: "alice@test.local",
        code: "333333",
        purpose: "register",
        attempts: 0,
        payload: JSON.stringify({ username: "alice", password_hash: "x", avatar: "y" }),
      });

      const res = await (await request())
        .post("/api/v1/auth/register/verify")
        .send({ email: "alice@test.local", code: "999999" });
      expect(res.status).toBe(400);
      // Should mention remaining attempts (4 left after first wrong attempt)
      expect(res.body.error).toMatch(/4/);
    });

    it("returns 200, creates the user, and sets a session on correct code", async () => {
      const passwordHash = await bcrypt.hash("testpass", 4);
      await createVerificationCode({
        email: "alice@test.local",
        code: "444444",
        purpose: "register",
        payload: JSON.stringify({
          username: "alice",
          password_hash: passwordHash,
          avatar: "https://avatar.url/alice",
        }),
      });

      const agent = supertest.agent(await getApp());
      const res = await agent
        .post("/api/v1/auth/register/verify")
        .send({ email: "alice@test.local", code: "444444" });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.user.name).toBe("alice");
      expect(typeof res.body.user.id).toBe("string");

      // User should exist in DB
      const prisma = getTestPrisma();
      const user = await prisma.user.findUnique({ where: { username: "alice" } });
      expect(user).not.toBeNull();
      expect(user.email).toBe("alice@test.local");

      // Session should be active: protected endpoint works
      const meRes = await agent.get("/api/v1/me");
      expect(meRes.body.user).not.toBeNull();
    });
  });

  // ── POST /api/v1/auth/login ───────────────────────────────────────────────

  describe("POST /api/v1/auth/login", () => {
    it("returns 401 for an unknown user", async () => {
      const res = await (await request())
        .post("/api/v1/auth/login")
        .send({ login: "nobody", password: "pass123" });
      expect(res.status).toBe(401);
    });

    it("returns 401 for a wrong password", async () => {
      await createUser({ username: "alice", email: "alice@test.local" });
      const res = await (await request())
        .post("/api/v1/auth/login")
        .send({ login: "alice", password: "wrongpass" });
      expect(res.status).toBe(401);
    });

    it("returns 403 for a banned user", async () => {
      await createUser({ username: "banned", email: "banned@test.local", is_banned: 1 });
      const res = await (await request())
        .post("/api/v1/auth/login")
        .send({ login: "banned", password: "testpass123" });
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/заблокирован/i);
    });

    it("returns 200 and user when logging in by username", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const res = await (await request())
        .post("/api/v1/auth/login")
        .send({ login: "alice", password: user._rawPassword });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.user.name).toBe("alice");
      expect(res.body.user.id).toBe(user.id);
    });

    it("returns 200 and user when logging in by email", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const res = await (await request())
        .post("/api/v1/auth/login")
        .send({ login: "alice@test.local", password: user._rawPassword });
      expect(res.status).toBe(200);
      expect(res.body.user.name).toBe("alice");
    });
  });

  // ── POST /api/v1/auth/logout ──────────────────────────────────────────────

  describe("POST /api/v1/auth/logout", () => {
    it("returns 200 and clears the session", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = supertest.agent(await getApp());

      // Log in
      await agent
        .post("/api/v1/auth/login")
        .send({ login: "alice", password: user._rawPassword })
        .expect(200);

      // Logout
      const logoutRes = await agent.post("/api/v1/auth/logout");
      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.ok).toBe(true);

      // Session should be gone: /me should return no user
      const meRes = await agent.get("/api/v1/me");
      expect(meRes.body.user).toBeFalsy();
    });
  });

  // ── POST /api/v1/auth/forgot-password/send-code ───────────────────────────

  describe("POST /api/v1/auth/forgot-password/send-code", () => {
    it("returns 400 for an invalid email format", async () => {
      const res = await (await request())
        .post("/api/v1/auth/forgot-password/send-code")
        .send({ email: "not-an-email" });
      expect(res.status).toBe(400);
    });

    it("returns 200 silently for an unknown email (avoids user enumeration)", async () => {
      const res = await (await request())
        .post("/api/v1/auth/forgot-password/send-code")
        .send({ email: "nobody@test.local" });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it("returns 200 and creates a reset code for a known email", async () => {
      await createUser({ username: "alice", email: "alice@test.local" });
      const res = await (await request())
        .post("/api/v1/auth/forgot-password/send-code")
        .send({ email: "alice@test.local" });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      const prisma = getTestPrisma();
      const code = await prisma.verificationCode.findFirst({
        where: { email: "alice@test.local", purpose: "reset", used: 0 },
      });
      expect(code).not.toBeNull();
    });
  });

  // ── POST /api/v1/auth/forgot-password/reset ──────────────────────────────

  describe("POST /api/v1/auth/forgot-password/reset", () => {
    it("returns 400 when no reset code exists", async () => {
      const res = await (await request())
        .post("/api/v1/auth/forgot-password/reset")
        .send({ email: "nobody@test.local", code: "123456", newPassword: "newpass123" });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/код не найден/i);
    });

    it("returns 400 for an expired reset code", async () => {
      const expiredAt = new Date(Date.now() - 1_000).toISOString();
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      await createVerificationCode({
        email: "alice@test.local",
        code: "555555",
        purpose: "reset",
        expires_at: expiredAt,
        payload: JSON.stringify({ userId: user.id, username: user.username }),
      });

      const res = await (await request())
        .post("/api/v1/auth/forgot-password/reset")
        .send({ email: "alice@test.local", code: "555555", newPassword: "newpass123" });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/истёк/i);
    });

    it("returns 400 for a wrong reset code", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      await createVerificationCode({
        email: "alice@test.local",
        code: "666666",
        purpose: "reset",
        payload: JSON.stringify({ userId: user.id, username: user.username }),
      });

      const res = await (await request())
        .post("/api/v1/auth/forgot-password/reset")
        .send({ email: "alice@test.local", code: "000000", newPassword: "newpass123" });
      expect(res.status).toBe(400);
    });

    it("resets password, auto-logs-in, and returns user on correct code", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      await createVerificationCode({
        email: "alice@test.local",
        code: "777777",
        purpose: "reset",
        payload: JSON.stringify({ userId: user.id, username: user.username }),
      });

      const agent = supertest.agent(await getApp());
      const res = await agent
        .post("/api/v1/auth/forgot-password/reset")
        .send({ email: "alice@test.local", code: "777777", newPassword: "brandnewpass" });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.user.name).toBe("alice");

      // Session should be active
      const meRes = await agent.get("/api/v1/me");
      expect(meRes.body.user).not.toBeNull();

      // New password should work on next login
      const loginRes = await (await request())
        .post("/api/v1/auth/login")
        .send({ login: "alice", password: "brandnewpass" });
      expect(loginRes.status).toBe(200);
    });
  });
});
