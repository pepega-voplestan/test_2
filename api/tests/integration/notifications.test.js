import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { request, authenticatedAgent, cleanDb, disconnectDb, getTestPrisma } from "../helpers.js";
import { createUser, createShout, createComment, createNotification } from "../fixtures/index.js";

function daysAgoStr(daysAgo) {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
}

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

    it("returns empty array and null nextCursor when there are no notifications", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);

      const res = await agent.get("/api/v1/notifications");
      expect(res.status).toBe(200);
      expect(res.body.notifications).toEqual([]);
      expect(res.body.nextCursor).toBeNull();
    });

    it("returns notifications with correct DTO shape", async () => {
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

    it("returns read notifications (no is_read filter)", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const actor = await createUser({ username: "bob", email: "bob@test.local" });
      const shout = await createShout({ userId: user.id });

      await createNotification({ userId: user.id, actorId: actor.id, type: "reply", shoutId: shout.id, is_read: 1 });

      const agent = await authenticatedAgent(user);
      const res = await agent.get("/api/v1/notifications");
      expect(res.status).toBe(200);
      expect(res.body.notifications).toHaveLength(1);
      expect(res.body.notifications[0].isRead).toBe(true);
    });

    it("returns both read and unread notifications together", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const actor = await createUser({ username: "bob", email: "bob@test.local" });
      const shout = await createShout({ userId: user.id });

      await createNotification({ userId: user.id, actorId: actor.id, type: "reply", shoutId: shout.id, is_read: 0 });
      await createNotification({ userId: user.id, actorId: actor.id, type: "mention", shoutId: shout.id, is_read: 1 });

      const agent = await authenticatedAgent(user);
      const res = await agent.get("/api/v1/notifications");
      expect(res.status).toBe(200);
      expect(res.body.notifications).toHaveLength(2);
    });

    it("excludes notifications older than 14 days", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const actor = await createUser({ username: "bob", email: "bob@test.local" });
      const shout = await createShout({ userId: user.id });

      await createNotification({
        userId: user.id,
        actorId: actor.id,
        type: "reply",
        shoutId: shout.id,
        created_at: daysAgoStr(15),
      });

      const agent = await authenticatedAgent(user);
      const res = await agent.get("/api/v1/notifications");
      expect(res.status).toBe(200);
      expect(res.body.notifications).toHaveLength(0);
    });

    it("includes notifications up to 14 days old", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const actor = await createUser({ username: "bob", email: "bob@test.local" });
      const shout = await createShout({ userId: user.id });

      // 13 days ago — should be included
      await createNotification({
        userId: user.id,
        actorId: actor.id,
        type: "reply",
        shoutId: shout.id,
        created_at: daysAgoStr(13),
      });

      const agent = await authenticatedAgent(user);
      const res = await agent.get("/api/v1/notifications");
      expect(res.status).toBe(200);
      expect(res.body.notifications).toHaveLength(1);
    });

    it("only returns notifications for the authenticated user", async () => {
      const alice = await createUser({ username: "alice", email: "alice@test.local" });
      const bob = await createUser({ username: "bob", email: "bob@test.local" });
      const actor = await createUser({ username: "carol", email: "carol@test.local" });
      const shout = await createShout({ userId: alice.id });

      await createNotification({ userId: bob.id, actorId: actor.id, type: "mention", shoutId: shout.id });

      const agent = await authenticatedAgent(alice);
      const res = await agent.get("/api/v1/notifications");
      expect(res.status).toBe(200);
      expect(res.body.notifications).toHaveLength(0);
    });

    // ── Pagination ────────────────────────────────────────────────────────

    it("returns nextCursor=null when results are fewer than limit", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const actor = await createUser({ username: "bob", email: "bob@test.local" });
      const shout = await createShout({ userId: user.id });

      await createNotification({ userId: user.id, actorId: actor.id, type: "reply", shoutId: shout.id });

      const agent = await authenticatedAgent(user);
      const res = await agent.get("/api/v1/notifications?limit=5");
      expect(res.status).toBe(200);
      expect(res.body.notifications).toHaveLength(1);
      expect(res.body.nextCursor).toBeNull();
    });

    it("returns nextCursor equal to the last item timestamp when a full page is returned", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const actor = await createUser({ username: "bob", email: "bob@test.local" });
      const shout = await createShout({ userId: user.id });

      for (let i = 0; i < 3; i++) {
        await createNotification({ userId: user.id, actorId: actor.id, type: "reply", shoutId: shout.id });
      }

      const agent = await authenticatedAgent(user);
      const res = await agent.get("/api/v1/notifications?limit=2");
      expect(res.status).toBe(200);
      expect(res.body.notifications).toHaveLength(2);
      expect(res.body.nextCursor).not.toBeNull();
      // nextCursor must be the timestamp of the last (oldest) item on the page
      expect(res.body.nextCursor).toBe(res.body.notifications[1].timestamp);
    });

    it("fetches the next page using cursor — no overlap, no gap", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const actor = await createUser({ username: "bob", email: "bob@test.local" });
      const shout = await createShout({ userId: user.id });

      // Create 5 notifications with distinct timestamps (1 second apart)
      const notifs = [];
      for (let i = 0; i < 5; i++) {
        const created_at = new Date(Date.now() - i * 1000).toISOString();
        notifs.push(await createNotification({
          userId: user.id, actorId: actor.id, type: "reply",
          shoutId: shout.id, created_at,
        }));
      }

      const agent = await authenticatedAgent(user);

      // Page 1
      const page1 = await agent.get("/api/v1/notifications?limit=3");
      expect(page1.body.notifications).toHaveLength(3);
      const cursor = page1.body.nextCursor;
      expect(cursor).not.toBeNull();

      // Page 2
      const page2 = await agent.get(`/api/v1/notifications?limit=3&cursor=${encodeURIComponent(cursor)}`);
      expect(page2.body.notifications).toHaveLength(2);
      expect(page2.body.nextCursor).toBeNull();

      // Combined IDs should be all 5, no duplicates
      const page1Ids = page1.body.notifications.map(n => n.id);
      const page2Ids = page2.body.notifications.map(n => n.id);
      const allIds = new Set([...page1Ids, ...page2Ids]);
      expect(allIds.size).toBe(5);
    });

    it("respects the limit query param", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const actor = await createUser({ username: "bob", email: "bob@test.local" });
      const shout = await createShout({ userId: user.id });

      for (let i = 0; i < 5; i++) {
        await createNotification({ userId: user.id, actorId: actor.id, type: "reply", shoutId: shout.id });
      }

      const agent = await authenticatedAgent(user);
      const res = await agent.get("/api/v1/notifications?limit=3");
      expect(res.status).toBe(200);
      expect(res.body.notifications).toHaveLength(3);
    });

    it("caps limit at 50", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const actor = await createUser({ username: "bob", email: "bob@test.local" });
      const shout = await createShout({ userId: user.id });

      for (let i = 0; i < 55; i++) {
        await createNotification({ userId: user.id, actorId: actor.id, type: "reply", shoutId: shout.id });
      }

      const agent = await authenticatedAgent(user);
      const res = await agent.get("/api/v1/notifications?limit=100");
      expect(res.status).toBe(200);
      expect(res.body.notifications.length).toBeLessThanOrEqual(50);
    });

    it("returns items ordered by created_at descending", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const actor = await createUser({ username: "bob", email: "bob@test.local" });
      const shout = await createShout({ userId: user.id });

      const older = await createNotification({
        userId: user.id, actorId: actor.id, type: "reply",
        shoutId: shout.id, created_at: daysAgoStr(2),
      });
      const newer = await createNotification({
        userId: user.id, actorId: actor.id, type: "mention",
        shoutId: shout.id, created_at: daysAgoStr(1),
      });

      const agent = await authenticatedAgent(user);
      const res = await agent.get("/api/v1/notifications");
      expect(res.body.notifications[0].id).toBe(newer.id);
      expect(res.body.notifications[1].id).toBe(older.id);
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

      const unchanged = await getTestPrisma().notification.findUnique({ where: { id: notif.id } });
      expect(unchanged.is_read).toBe(0);
    });

    it("silently caps at 50 ids (processes only first 50)", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const actor = await createUser({ username: "bob", email: "bob@test.local" });
      const shout = await createShout({ userId: user.id });

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
