import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { request, authenticatedAgent, cleanDb, disconnectDb, getTestPrisma } from "../helpers.js";
import { createUser, createShout, createComment, createShoutLike } from "../fixtures/index.js";

describe("Likes routes", () => {
  beforeEach(async () => {
    await cleanDb();
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await cleanDb();
    await disconnectDb();
  });

  // ── POST /api/v1/shouts/:id/like ──────────────────────────────────────────

  describe("POST /api/v1/shouts/:id/like", () => {
    it("returns 401 when not authenticated", async () => {
      const author = await createUser({ username: "author", email: "author@test.local" });
      const shout = await createShout({ userId: author.id });

      const res = await (await request()).post(`/api/v1/shouts/${shout.id}/like`);
      expect(res.status).toBe(401);
    });

    it("returns 403 when user is banned", async () => {
      const author = await createUser({ username: "author", email: "author@test.local" });
      const shout = await createShout({ userId: author.id });
      const liker = await createUser({ username: "liker", email: "liker@test.local" });
      const agent = await authenticatedAgent(liker);

      // Ban after login
      await getTestPrisma().user.update({ where: { id: liker.id }, data: { is_banned: 1 } });

      const res = await agent.post(`/api/v1/shouts/${shout.id}/like`);
      expect(res.status).toBe(403);
    });

    it("adds a like and returns { likes: 1, isLiked: true } on first call", async () => {
      const author = await createUser({ username: "author", email: "author@test.local" });
      const shout = await createShout({ userId: author.id });
      const liker = await createUser({ username: "liker", email: "liker@test.local" });
      const agent = await authenticatedAgent(liker);

      const res = await agent.post(`/api/v1/shouts/${shout.id}/like`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ likes: 1, isLiked: true });
    });

    it("removes the like and returns { likes: 0, isLiked: false } on second call (toggle)", async () => {
      const author = await createUser({ username: "author", email: "author@test.local" });
      const shout = await createShout({ userId: author.id });
      const liker = await createUser({ username: "liker", email: "liker@test.local" });
      const agent = await authenticatedAgent(liker);

      await agent.post(`/api/v1/shouts/${shout.id}/like`).expect(200); // like
      const res = await agent.post(`/api/v1/shouts/${shout.id}/like`); // unlike
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ likes: 0, isLiked: false });
    });

    it("reflects correct total when multiple users have liked", async () => {
      const author = await createUser({ username: "author", email: "author@test.local" });
      const shout = await createShout({ userId: author.id });
      // Seed two existing likes directly
      const userA = await createUser({ username: "a", email: "a@test.local" });
      const userB = await createUser({ username: "b", email: "b@test.local" });
      await createShoutLike({ shoutId: shout.id, userId: userA.id });
      await createShoutLike({ shoutId: shout.id, userId: userB.id });

      const liker = await createUser({ username: "liker", email: "liker@test.local" });
      const agent = await authenticatedAgent(liker);

      const res = await agent.post(`/api/v1/shouts/${shout.id}/like`);
      expect(res.status).toBe(200);
      expect(res.body.likes).toBe(3);
      expect(res.body.isLiked).toBe(true);
    });
  });

  // ── POST /api/v1/comments/:id/like ───────────────────────────────────────

  describe("POST /api/v1/comments/:id/like", () => {
    it("returns 401 when not authenticated", async () => {
      const author = await createUser({ username: "author", email: "author@test.local" });
      const shout = await createShout({ userId: author.id });
      const comment = await createComment({ shoutId: shout.id, userId: author.id });

      const res = await (await request()).post(`/api/v1/comments/${comment.id}/like`);
      expect(res.status).toBe(401);
    });

    it("adds a like and returns { likes: 1, isLiked: true } on first call", async () => {
      const author = await createUser({ username: "author", email: "author@test.local" });
      const shout = await createShout({ userId: author.id });
      const comment = await createComment({ shoutId: shout.id, userId: author.id });
      const liker = await createUser({ username: "liker", email: "liker@test.local" });
      const agent = await authenticatedAgent(liker);

      const res = await agent.post(`/api/v1/comments/${comment.id}/like`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ likes: 1, isLiked: true });
    });

    it("removes the like and returns { likes: 0, isLiked: false } on second call (toggle)", async () => {
      const author = await createUser({ username: "author", email: "author@test.local" });
      const shout = await createShout({ userId: author.id });
      const comment = await createComment({ shoutId: shout.id, userId: author.id });
      const liker = await createUser({ username: "liker", email: "liker@test.local" });
      const agent = await authenticatedAgent(liker);

      await agent.post(`/api/v1/comments/${comment.id}/like`).expect(200); // like
      const res = await agent.post(`/api/v1/comments/${comment.id}/like`); // unlike
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ likes: 0, isLiked: false });
    });
  });
});
