import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { request, authenticatedAgent, cleanDb, disconnectDb, getTestPrisma } from "../helpers.js";
import { createUser, createShout, createComment, createNotification } from "../fixtures/index.js";

describe("Notifications routes", () => {
  beforeEach(async () => {
    await cleanDb();
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await cleanDb();
    await disconnectDb();
  });

  // ── GET /api/v1/notifications ─────────────────────────────────────────────

  describe("GET /api/v1/notifications", () => {
    it("returns 401 when not authenticated", async () => {
      const res = await (await request()).get("/api/v1/notifications");
      expect(res.status).toBe(401);
    });

    it("returns empty array when there are no notifications", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);

      const res = await agent.get("/api/v1/notifications");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ notifications: [] });
    });

    it("returns unread notifications with correct DTO shape", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const actor = await createUser({ username: "bob", email: "bob@test.local" });
      const shout = await createShout({ userId: user.id, content: "Hello world" });
      const comment = await createComment({ shoutId: shout.id, userId: actor.id, content: "Nice shout @[alice]" });
      const notif = await createNotification({
        userId: user.id,
        actorId: actor.id,
        type: "mention",
        shoutId: shout.id,
        commentId: comment.id,
      });

      const agent = await authenticatedAgent(user);
      const res = await agent.get("/api/v1/notifications");
      expect(res.status).toBe(200);

      const n = res.body.notifications[0];
      expect(n.id).toBe(notif.id);
      expect(n.type).toBe("mention");
      expect(n.actor).toMatchObject({ id: actor.id, name: "bob" });
      expect(n.shoutId).toBe(shout.id);
      expect(n.commentId).toBe(comment.id);
      expect(n.isRead).toBe(false);
      expect(typeof n.timestamp).toBe("string");
      expect(n.timestamp).toMatch(/Z$/); // ISO 8601 with Z
      expect(typeof n.snippet).toBe("string");
    });

    it("excludes notifications older than 7 days", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const actor = await createUser({ username: "bob", email: "bob@test.local" });
      const shout = await createShout({ userId: user.id });

      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
        .toISOString()
        .replace("T", " ")
        .replace(/\.\d{3}Z$/, "");

      await createNotification({
        userId: user.id,
        actorId: actor.id,
        type: "reply",
        shoutId: shout.id,
        created_at: eightDaysAgo,
      });

      const agent = await authenticatedAgent(user);
      const res = await agent.get("/api/v1/notifications");
      expect(res.status).toBe(200);
      expect(res.body.notifications).toHaveLength(0);
    });

    it("excludes already-read notifications", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const actor = await createUser({ username: "bob", email: "bob@test.local" });
      const shout = await createShout({ userId: user.id });

      await createNotification({
        userId: user.id,
        actorId: actor.id,
        type: "reply",
        shoutId: shout.id,
        is_read: 1,
      });

      const agent = await authenticatedAgent(user);
      const res = await agent.get("/api/v1/notifications");
      expect(res.status).toBe(200);
      expect(res.body.notifications).toHaveLength(0);
    });

    it("only returns notifications for the authenticated user", async () => {
      const alice = await createUser({ username: "alice", email: "alice@test.local" });
      const bob = await createUser({ username: "bob", email: "bob@test.local" });
      const actor = await createUser({ username: "carol", email: "carol@test.local" });
      const shout = await createShout({ userId: alice.id });

      // Notification for bob, not alice
      await createNotification({ userId: bob.id, actorId: actor.id, type: "mention", shoutId: shout.id });

      const agent = await authenticatedAgent(alice);
      const res = await agent.get("/api/v1/notifications");
      expect(res.status).toBe(200);
      expect(res.body.notifications).toHaveLength(0);
    });
  });

  // ── PATCH /api/v1/notifications/read-batch ────────────────────────────────

  describe("PATCH /api/v1/notifications/read-batch", () => {
    it("returns 401 when not authenticated", async () => {
      const res = await (await request()).patch("/api/v1/notifications/read-batch").send({ ids: ["x"] });
      expect(res.status).toBe(401);
    });

    it("returns 400 when ids is not an array", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);

      const res = await agent.patch("/api/v1/notifications/read-batch").send({ ids: "abc" });
      expect(res.status).toBe(400);
    });

    it("returns 400 when ids is an empty array", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);

      const res = await agent.patch("/api/v1/notifications/read-batch").send({ ids: [] });
      expect(res.status).toBe(400);
    });

    it("marks specified notifications as read", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const actor = await createUser({ username: "bob", email: "bob@test.local" });
      const shout = await createShout({ userId: user.id });
      const notif = await createNotification({ userId: user.id, actorId: actor.id, type: "reply", shoutId: shout.id });

      const agent = await authenticatedAgent(user);
      const res = await agent.patch("/api/v1/notifications/read-batch").send({ ids: [notif.id] });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });

      const updated = await getTestPrisma().notification.findUnique({ where: { id: notif.id } });
      expect(updated.is_read).toBe(1);
    });

    it("does not mark another user's notifications as read", async () => {
      const alice = await createUser({ username: "alice", email: "alice@test.local" });
      const bob = await createUser({ username: "bob", email: "bob@test.local" });
      const actor = await createUser({ username: "carol", email: "carol@test.local" });
      const shout = await createShout({ userId: bob.id });
      const notif = await createNotification({ userId: bob.id, actorId: actor.id, type: "reply", shoutId: shout.id });

      const agent = await authenticatedAgent(alice);
      const res = await agent.patch("/api/v1/notifications/read-batch").send({ ids: [notif.id] });
      expect(res.status).toBe(200);

      // Bob's notification should still be unread
      const unchanged = await getTestPrisma().notification.findUnique({ where: { id: notif.id } });
      expect(unchanged.is_read).toBe(0);
    });

    it("silently caps at 50 ids (processes only first 50)", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const actor = await createUser({ username: "bob", email: "bob@test.local" });
      const shout = await createShout({ userId: user.id });

      // Create 55 notifications
      const notifs = [];
      for (let i = 0; i < 55; i++) {
        notifs.push(await createNotification({ userId: user.id, actorId: actor.id, type: "reply", shoutId: shout.id }));
      }

      const agent = await authenticatedAgent(user);
      const res = await agent.patch("/api/v1/notifications/read-batch").send({ ids: notifs.map(n => n.id) });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });

      const readCount = await getTestPrisma().notification.count({
        where: { user_id: user.id, is_read: 1 },
      });
      expect(readCount).toBe(50);
    });
  });

  // ── PATCH /api/v1/notifications/read-all ─────────────────────────────────

  describe("PATCH /api/v1/notifications/read-all", () => {
    it("returns 401 when not authenticated", async () => {
      const res = await (await request()).patch("/api/v1/notifications/read-all");
      expect(res.status).toBe(401);
    });

    it("marks all unread notifications as read", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const actor = await createUser({ username: "bob", email: "bob@test.local" });
      const shout = await createShout({ userId: user.id });

      await createNotification({ userId: user.id, actorId: actor.id, type: "reply", shoutId: shout.id });
      await createNotification({ userId: user.id, actorId: actor.id, type: "mention", shoutId: shout.id });

      const agent = await authenticatedAgent(user);
      const res = await agent.patch("/api/v1/notifications/read-all");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });

      const unread = await getTestPrisma().notification.count({
        where: { user_id: user.id, is_read: 0 },
      });
      expect(unread).toBe(0);
    });

    it("does not mark another user's notifications as read", async () => {
      const alice = await createUser({ username: "alice", email: "alice@test.local" });
      const bob = await createUser({ username: "bob", email: "bob@test.local" });
      const actor = await createUser({ username: "carol", email: "carol@test.local" });
      const shout = await createShout({ userId: bob.id });

      await createNotification({ userId: bob.id, actorId: actor.id, type: "reply", shoutId: shout.id });

      const agent = await authenticatedAgent(alice);
      await agent.patch("/api/v1/notifications/read-all");

      const bobUnread = await getTestPrisma().notification.count({
        where: { user_id: bob.id, is_read: 0 },
      });
      expect(bobUnread).toBe(1);
    });
  });
});
