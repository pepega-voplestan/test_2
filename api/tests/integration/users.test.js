import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import supertest from "supertest";
import { request, authenticatedAgent, cleanDb, disconnectDb, getTestPrisma, getApp } from "../helpers.js";
import { createUser, createShout, createVerificationCode } from "../fixtures/index.js";

describe("Users routes", () => {
  beforeEach(async () => {
    await cleanDb();
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await cleanDb();
    await disconnectDb();
  });

  // ── GET /api/v1/users/mentions ────────────────────────────────────────────

  describe("GET /api/v1/users/mentions", () => {
    it("returns all non-banned users", async () => {
      const alice = await createUser({ username: "alice", email: "alice@test.local" });
      const bob = await createUser({ username: "bob", email: "bob@test.local" });

      const res = await (await request()).get("/api/v1/users/mentions");
      expect(res.status).toBe(200);
      const ids = res.body.users.map((u) => u.id);
      expect(ids).toContain(alice.id);
      expect(ids).toContain(bob.id);
    });

    it("excludes banned users", async () => {
      await createUser({ username: "alice", email: "alice@test.local" });
      const banned = await createUser({ username: "banned", email: "banned@test.local", is_banned: 1 });

      const res = await (await request()).get("/api/v1/users/mentions");
      expect(res.status).toBe(200);
      const ids = res.body.users.map((u) => u.id);
      expect(ids).not.toContain(banned.id);
    });

    it("returns users with id, name, avatar fields", async () => {
      const alice = await createUser({ username: "alice", email: "alice@test.local" });

      const res = await (await request()).get("/api/v1/users/mentions");
      expect(res.status).toBe(200);
      const user = res.body.users.find((u) => u.id === alice.id);
      expect(user).toMatchObject({ id: alice.id, name: "alice" });
      expect(typeof user.avatar).toBe("string");
    });
  });

  // ── GET /api/v1/users/:id ─────────────────────────────────────────────────

  describe("GET /api/v1/users/:id", () => {
    it("returns 404 for a non-existent user", async () => {
      const res = await (await request()).get("/api/v1/users/00000000-0000-0000-0000-000000000000");
      expect(res.status).toBe(404);
    });

    it("returns profile without email for non-owner", async () => {
      const alice = await createUser({ username: "alice", email: "alice@test.local" });

      const res = await (await request()).get(`/api/v1/users/${alice.id}`);
      expect(res.status).toBe(200);
      expect(res.body.profile).toMatchObject({
        id: alice.id,
        name: "alice",
        isOwner: false,
        shoutCount: 0,
      });
      expect(res.body.profile.email).toBeUndefined();
      expect(res.body.profile.showNsfw).toBeUndefined();
    });

    it("returns profile with email and preferences for owner", async () => {
      const alice = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(alice);

      const res = await agent.get(`/api/v1/users/${alice.id}`);
      expect(res.status).toBe(200);
      expect(res.body.profile).toMatchObject({
        id: alice.id,
        name: "alice",
        isOwner: true,
        email: "alice@test.local",
      });
      expect(typeof res.body.profile.showNsfw).toBe("boolean");
      expect(typeof res.body.profile.showPolitics).toBe("boolean");
    });

    it("includes shoutCount reflecting only non-deleted shouts", async () => {
      const alice = await createUser({ username: "alice", email: "alice@test.local" });
      await createShout({ userId: alice.id });
      await createShout({ userId: alice.id });
      await createShout({ userId: alice.id, is_deleted: 1 });

      const res = await (await request()).get(`/api/v1/users/${alice.id}`);
      expect(res.body.profile.shoutCount).toBe(2);
    });
  });

  // ── GET /api/v1/users/:id/shouts ──────────────────────────────────────────

  describe("GET /api/v1/users/:id/shouts", () => {
    it("returns user's shouts", async () => {
      const alice = await createUser({ username: "alice", email: "alice@test.local" });
      await createShout({ userId: alice.id, content: "My shout" });

      const res = await (await request()).get(`/api/v1/users/${alice.id}/shouts`);
      expect(res.status).toBe(200);
      expect(res.body.shouts).toHaveLength(1);
      expect(res.body.shouts[0].content).toBe("My shout");
    });

    it("excludes soft-deleted shouts", async () => {
      const alice = await createUser({ username: "alice", email: "alice@test.local" });
      await createShout({ userId: alice.id, content: "Visible" });
      await createShout({ userId: alice.id, content: "Deleted", is_deleted: 1 });

      const res = await (await request()).get(`/api/v1/users/${alice.id}/shouts`);
      expect(res.status).toBe(200);
      expect(res.body.shouts).toHaveLength(1);
      expect(res.body.shouts[0].content).toBe("Visible");
    });

    it("supports pagination with hasMore", async () => {
      const alice = await createUser({ username: "alice", email: "alice@test.local" });
      for (let i = 0; i < 3; i++) {
        await createShout({ userId: alice.id, content: `Shout ${i}` });
      }

      const res = await (await request()).get(`/api/v1/users/${alice.id}/shouts?limit=2`);
      expect(res.status).toBe(200);
      expect(res.body.shouts).toHaveLength(2);
      expect(res.body.hasMore).toBe(true);
    });
  });

  // ── PUT /api/v1/users/:id ─────────────────────────────────────────────────

  describe("PUT /api/v1/users/:id", () => {
    it("returns 401 when not authenticated", async () => {
      const alice = await createUser({ username: "alice", email: "alice@test.local" });
      const res = await (await request()).put(`/api/v1/users/${alice.id}`).send({ username: "alice2" });
      expect(res.status).toBe(401);
    });

    it("returns 403 when editing another user's profile", async () => {
      const alice = await createUser({ username: "alice", email: "alice@test.local" });
      const bob = await createUser({ username: "bob", email: "bob@test.local" });
      const agent = await authenticatedAgent(bob);

      const res = await agent.put(`/api/v1/users/${alice.id}`).send({ username: "hacked" });
      expect(res.status).toBe(403);
    });

    it("returns 409 when username is already taken", async () => {
      const alice = await createUser({ username: "alice", email: "alice@test.local" });
      await createUser({ username: "bob", email: "bob@test.local" });
      const agent = await authenticatedAgent(alice);

      const res = await agent.put(`/api/v1/users/${alice.id}`).send({ username: "bob" });
      expect(res.status).toBe(409);
    });

    it("updates username and returns updated profile", async () => {
      const alice = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(alice);

      const res = await agent.put(`/api/v1/users/${alice.id}`).send({ username: "alice2" });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.user.name).toBe("alice2");
      expect(res.body.profile.name).toBe("alice2");

      const row = await getTestPrisma().user.findUnique({ where: { id: alice.id } });
      expect(row.username).toBe("alice2");
    });

    it("returns 400 when newPassword is provided without currentPassword", async () => {
      const alice = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(alice);

      const res = await agent.put(`/api/v1/users/${alice.id}`).send({ newPassword: "newpass123" });
      expect(res.status).toBe(400);
    });

    it("returns 400 when currentPassword is wrong", async () => {
      const alice = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(alice);

      const res = await agent.put(`/api/v1/users/${alice.id}`).send({
        currentPassword: "wrongpassword",
        newPassword: "newpass123",
      });
      expect(res.status).toBe(400);
    });

    it("updates password and allows login with new password", async () => {
      const alice = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(alice);

      const res = await agent.put(`/api/v1/users/${alice.id}`).send({
        currentPassword: alice._rawPassword,
        newPassword: "newpass123",
      });
      expect(res.status).toBe(200);

      // Login with new password
      const loginAgent = supertest.agent(await getApp());
      const loginRes = await loginAgent
        .post("/api/v1/auth/login")
        .send({ login: "alice", password: "newpass123" });
      expect(loginRes.status).toBe(200);
    });

    it("updates content preferences", async () => {
      const alice = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(alice);

      const res = await agent.put(`/api/v1/users/${alice.id}`).send({
        showNsfw: true,
        showPolitics: true,
      });
      expect(res.status).toBe(200);
      expect(res.body.profile.showNsfw).toBe(true);
      expect(res.body.profile.showPolitics).toBe(true);

      const row = await getTestPrisma().user.findUnique({ where: { id: alice.id } });
      expect(row.show_nsfw).toBe(1);
      expect(row.show_politics).toBe(1);
    });
  });

  // ── POST /api/v1/users/:id/email/send-code ────────────────────────────────

  describe("POST /api/v1/users/:id/email/send-code", () => {
    it("returns 401 when not authenticated", async () => {
      const alice = await createUser({ username: "alice", email: "alice@test.local" });
      const res = await (await request())
        .post(`/api/v1/users/${alice.id}/email/send-code`)
        .send({ email: "new@test.local" });
      expect(res.status).toBe(401);
    });

    it("returns 403 when trying to change another user's email", async () => {
      const alice = await createUser({ username: "alice", email: "alice@test.local" });
      const bob = await createUser({ username: "bob", email: "bob@test.local" });
      const agent = await authenticatedAgent(bob);

      const res = await agent
        .post(`/api/v1/users/${alice.id}/email/send-code`)
        .send({ email: "new@test.local" });
      expect(res.status).toBe(403);
    });

    it("returns 400 for an invalid email address", async () => {
      const alice = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(alice);

      const res = await agent
        .post(`/api/v1/users/${alice.id}/email/send-code`)
        .send({ email: "not-an-email" });
      expect(res.status).toBe(400);
    });

    it("returns 409 when email is already taken by another user", async () => {
      const alice = await createUser({ username: "alice", email: "alice@test.local" });
      await createUser({ username: "bob", email: "bob@test.local" });
      const agent = await authenticatedAgent(alice);

      const res = await agent
        .post(`/api/v1/users/${alice.id}/email/send-code`)
        .send({ email: "bob@test.local" });
      expect(res.status).toBe(409);
    });

    it("returns 200 and creates a verification code for valid request", async () => {
      const alice = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(alice);

      const res = await agent
        .post(`/api/v1/users/${alice.id}/email/send-code`)
        .send({ email: "newalice@test.local" });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });

      const code = await getTestPrisma().verificationCode.findFirst({
        where: { email: "newalice@test.local", purpose: "email_change", used: 0 },
      });
      expect(code).not.toBeNull();
    });
  });

  // ── POST /api/v1/users/:id/email/verify ───────────────────────────────────

  describe("POST /api/v1/users/:id/email/verify", () => {
    it("returns 401 when not authenticated", async () => {
      const alice = await createUser({ username: "alice", email: "alice@test.local" });
      const res = await (await request())
        .post(`/api/v1/users/${alice.id}/email/verify`)
        .send({ email: "new@test.local", code: "123456" });
      expect(res.status).toBe(401);
    });

    it("returns 400 when no unused code exists for the email", async () => {
      const alice = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(alice);

      const res = await agent
        .post(`/api/v1/users/${alice.id}/email/verify`)
        .send({ email: "nobody@test.local", code: "123456" });
      expect(res.status).toBe(400);
    });

    it("returns 400 for an expired code", async () => {
      const alice = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(alice);

      const expired = new Date(Date.now() - 1000).toISOString();
      await createVerificationCode({
        email: "newalice@test.local",
        code: "111111",
        purpose: "email_change",
        expires_at: expired,
        payload: JSON.stringify({ userId: alice.id, newEmail: "newalice@test.local" }),
      });

      const res = await agent
        .post(`/api/v1/users/${alice.id}/email/verify`)
        .send({ email: "newalice@test.local", code: "111111" });
      expect(res.status).toBe(400);
    });

    it("returns 400 for a wrong code", async () => {
      const alice = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(alice);

      await createVerificationCode({
        email: "newalice@test.local",
        code: "222222",
        purpose: "email_change",
        payload: JSON.stringify({ userId: alice.id, newEmail: "newalice@test.local" }),
      });

      const res = await agent
        .post(`/api/v1/users/${alice.id}/email/verify`)
        .send({ email: "newalice@test.local", code: "999999" });
      expect(res.status).toBe(400);
    });

    it("returns 200 and updates email on correct code", async () => {
      const alice = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(alice);

      await createVerificationCode({
        email: "newalice@test.local",
        code: "333333",
        purpose: "email_change",
        payload: JSON.stringify({ userId: alice.id, newEmail: "newalice@test.local" }),
      });

      const res = await agent
        .post(`/api/v1/users/${alice.id}/email/verify`)
        .send({ email: "newalice@test.local", code: "333333" });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, email: "newalice@test.local" });

      const row = await getTestPrisma().user.findUnique({ where: { id: alice.id } });
      expect(row.email).toBe("newalice@test.local");
    });
  });
});
