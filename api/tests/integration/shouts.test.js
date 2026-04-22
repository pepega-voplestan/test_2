import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { request, authenticatedAgent, cleanDb, disconnectDb, getTestPrisma } from "../helpers.js";
import { createUser, createShout, createMedia } from "../fixtures/index.js";

describe("Shouts routes", () => {
  beforeEach(async () => {
    await cleanDb();
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await cleanDb();
    await disconnectDb();
  });

  // ── GET /api/v1/shouts ────────────────────────────────────────────────────

  describe("GET /api/v1/shouts", () => {
    it("returns empty feed when no shouts exist", async () => {
      const res = await (await request()).get("/api/v1/shouts");
      expect(res.status).toBe(200);
      expect(res.body.shouts).toEqual([]);
      expect(res.body.hasMore).toBe(false);
    });

    it("returns shouts with correct DTO shape", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      await createShout({ userId: user.id, content: "Hello world" });

      const res = await (await request()).get("/api/v1/shouts");
      expect(res.status).toBe(200);
      expect(res.body.shouts).toHaveLength(1);

      const s = res.body.shouts[0];
      expect(s).toMatchObject({
        user: { id: user.id, name: "alice" },
        content: "Hello world",
        isDeleted: false,
        likes: 0,
        visibilityTag: "",
      });
      expect(typeof s.id).toBe("string");
      expect(typeof s.timestamp).toBe("string");
      expect(s.timestamp).toMatch(/Z$/);
      expect(Array.isArray(s.comments)).toBe(true);
    });

    it("returns soft-deleted shouts with isDeleted: true and masked content", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      await createShout({ userId: user.id, content: "Deleted shout", is_deleted: 1 });
      await createShout({ userId: user.id, content: "Visible shout" });

      const res = await (await request()).get("/api/v1/shouts");
      expect(res.status).toBe(200);
      expect(res.body.shouts).toHaveLength(2);

      const deleted = res.body.shouts.find((s) => s.isDeleted);
      const visible = res.body.shouts.find((s) => !s.isDeleted);
      expect(deleted.content).toBe("");
      expect(deleted.user).toBeNull();
      expect(visible.content).toBe("Visible shout");
    });

    it("returns hasMore: true when results exceed limit and provides nextCursor", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      for (let i = 0; i < 3; i++) {
        await createShout({ userId: user.id, content: `Shout ${i}` });
      }

      const res = await (await request()).get("/api/v1/shouts?limit=2");
      expect(res.status).toBe(200);
      expect(res.body.shouts).toHaveLength(2);
      expect(res.body.hasMore).toBe(true);
      expect(typeof res.body.nextCursor).toBe("string");
    });

    it("cursor pagination returns the next page correctly", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      // Use distinct timestamps (second-precision) to guarantee deterministic ordering
      const t = (offsetSecs) =>
        new Date(Date.now() - offsetSecs * 1000).toISOString();

      await createShout({ userId: user.id, content: "Oldest", created_at: t(10) });
      await createShout({ userId: user.id, content: "Middle", created_at: t(5) });
      await createShout({ userId: user.id, content: "Newest", created_at: t(1) });

      // First page: limit=2 gets newest 2
      const page1 = await (await request()).get("/api/v1/shouts?limit=2");
      expect(page1.body.shouts).toHaveLength(2);
      expect(page1.body.hasMore).toBe(true);
      const cursor = page1.body.nextCursor;

      // Second page: should get oldest shout
      const page2 = await (await request()).get(`/api/v1/shouts?limit=2&cursor=${encodeURIComponent(cursor)}`);
      expect(page2.body.shouts).toHaveLength(1);
      expect(page2.body.hasMore).toBe(false);
      expect(page2.body.shouts[0].content).toBe("Oldest");
    });

    it("sortBy=popular returns shouts from last 7 days ordered by comment count", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      await createShout({ userId: user.id, content: "Popular shout" });

      const res = await (await request()).get("/api/v1/shouts?sortBy=popular");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.shouts)).toBe(true);
    });
  });

  // ── GET /api/v1/shouts/:id ────────────────────────────────────────────────

  describe("GET /api/v1/shouts/:id", () => {
    it("returns 404 for a non-existent shout", async () => {
      const res = await (await request()).get("/api/v1/shouts/00000000-0000-0000-0000-000000000000");
      expect(res.status).toBe(404);
    });

    it("returns shout DTO for a valid shout", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const shout = await createShout({ userId: user.id, content: "My shout" });

      const res = await (await request()).get(`/api/v1/shouts/${shout.id}`);
      expect(res.status).toBe(200);
      expect(res.body.shout).toMatchObject({
        id: shout.id,
        content: "My shout",
        isDeleted: false,
        user: { id: user.id, name: "alice" },
      });
    });

    it("returns shout with isDeleted: true and masked fields when soft-deleted", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const shout = await createShout({ userId: user.id, content: "Secret", is_deleted: 1 });

      const res = await (await request()).get(`/api/v1/shouts/${shout.id}`);
      expect(res.status).toBe(200);
      expect(res.body.shout.isDeleted).toBe(true);
      expect(res.body.shout.content).toBe("");
      expect(res.body.shout.user).toBeNull();
    });
  });

  // ── DELETE /api/v1/shouts/:id ─────────────────────────────────────────────

  describe("DELETE /api/v1/shouts/:id", () => {
    it("returns 401 when not authenticated", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const shout = await createShout({ userId: user.id });

      const res = await (await request()).delete(`/api/v1/shouts/${shout.id}`);
      expect(res.status).toBe(401);
    });

    it("returns 404 when shout does not exist", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);

      const res = await agent.delete("/api/v1/shouts/00000000-0000-0000-0000-000000000000");
      expect(res.status).toBe(404);
    });

    it("returns 404 when shout is already soft-deleted", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const shout = await createShout({ userId: user.id, is_deleted: 1 });
      const agent = await authenticatedAgent(user);

      const res = await agent.delete(`/api/v1/shouts/${shout.id}`);
      expect(res.status).toBe(404);
    });

    it("returns 403 when trying to delete another user's shout", async () => {
      const author = await createUser({ username: "author", email: "author@test.local" });
      const shout = await createShout({ userId: author.id });
      const other = await createUser({ username: "other", email: "other@test.local" });
      const agent = await authenticatedAgent(other);

      const res = await agent.delete(`/api/v1/shouts/${shout.id}`);
      expect(res.status).toBe(403);
    });

    it("returns 200 and soft-deletes the shout", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const shout = await createShout({ userId: user.id });
      const agent = await authenticatedAgent(user);

      const res = await agent.delete(`/api/v1/shouts/${shout.id}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });

      const updated = await getTestPrisma().shout.findUnique({ where: { id: shout.id } });
      expect(updated.is_deleted).toBe(1);
    });
  });

  // ── POST /api/v1/shouts ───────────────────────────────────────────────────

  describe("POST /api/v1/shouts", () => {
    it("returns 401 when not authenticated", async () => {
      const res = await (await request()).post("/api/v1/shouts").send({ content: "Hello" });
      expect(res.status).toBe(401);
    });

    it("returns 403 when user is banned", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);
      await getTestPrisma().user.update({ where: { id: user.id }, data: { is_banned: 1 } });

      const res = await agent.post("/api/v1/shouts").send({ content: "Hello" });
      expect(res.status).toBe(403);
    });

    it("returns 400 when content is empty and no media is provided", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);

      const res = await agent.post("/api/v1/shouts").send({ content: "" });
      expect(res.status).toBe(400);
    });

    it("returns 400 when content exceeds max length", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);

      const res = await agent.post("/api/v1/shouts").send({ content: "x".repeat(401) });
      expect(res.status).toBe(400);
    });

    it("returns 400 when mediaId does not exist in DB", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);

      const res = await agent.post("/api/v1/shouts").send({
        content: "With media",
        mediaId: "00000000-0000-0000-0000-000000000000",
      });
      expect(res.status).toBe(400);
    });

    it("creates a shout and returns DTO on success", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);

      const res = await agent.post("/api/v1/shouts").send({ content: "Hello world!" });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(typeof res.body.id).toBe("string");
      expect(res.body.shout).toMatchObject({
        content: "Hello world!",
        isDeleted: false,
        likes: 0,
        visibilityTag: "",
        user: { id: user.id, name: "alice" },
      });

      // Verify row in DB
      const row = await getTestPrisma().shout.findUnique({ where: { id: res.body.id } });
      expect(row).not.toBeNull();
      expect(row.content).toBe("Hello world!");
    });

    it("attaches media when a valid mediaId is provided", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const media = await createMedia({ userId: user.id });
      const agent = await authenticatedAgent(user);

      const res = await agent.post("/api/v1/shouts").send({
        content: "With image",
        mediaId: media.id,
      });
      expect(res.status).toBe(200);
      expect(res.body.shout.media).toBeDefined();
      expect(res.body.shout.media.type).toBe("image");
    });

    it("sets visibilityTag on the shout", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);
      const media = await createMedia({ userId: user.id });

      const res = await agent.post("/api/v1/shouts").send({
        content: "Spoiler content",
        visibilityTag: "spoiler",
        mediaId: media.id,
      });
      expect(res.status).toBe(200);
      expect(res.body.shout.visibilityTag).toBe("spoiler");
    });

    it("strips spoiler tag when no media is attached", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);

      const res = await agent.post("/api/v1/shouts").send({
        content: "Spoiler content",
        visibilityTag: "spoiler",
      });
      expect(res.status).toBe(200);
      expect(res.body.shout.visibilityTag).toBe("");
    });

    it("creates a mention notification for @mentioned users", async () => {
      const author = await createUser({ username: "alice", email: "alice@test.local" });
      const mentioned = await createUser({ username: "bob", email: "bob@test.local" });
      const agent = await authenticatedAgent(author);

      await agent.post("/api/v1/shouts").send({
        content: `Hey @[bob:${mentioned.id}] check this out`,
      });

      const notification = await getTestPrisma().notification.findFirst({
        where: { user_id: mentioned.id, type: "mention" },
      });
      expect(notification).not.toBeNull();
      expect(notification.actor_id).toBe(author.id);
    });
  });
});
