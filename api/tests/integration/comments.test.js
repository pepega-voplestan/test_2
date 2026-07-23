import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import supertest from "supertest";
import { request, getApp, authenticatedAgent, cleanDb, disconnectDb, getTestPrisma } from "../helpers.js";
import { createUser, createShout, createComment, createMedia } from "../fixtures/index.js";

describe("Comments routes", () => {
  beforeEach(async () => {
    await cleanDb();
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await cleanDb();
    await disconnectDb();
  });

  // ── POST /api/v1/shouts/:id/replies ──────────────────────────────────────

  describe("POST /api/v1/shouts/:id/replies", () => {
    it("returns 401 when not authenticated", async () => {
      const author = await createUser({ username: "author", email: "author@test.local" });
      const shout = await createShout({ userId: author.id });

      const res = await (await request())
        .post(`/api/v1/shouts/${shout.id}/replies`)
        .send({ content: "Hello" });
      expect(res.status).toBe(401);
    });

    it("returns 403 when the user is banned", async () => {
      // Create user as non-banned so they can log in, then ban them
      const author = await createUser({ username: "author", email: "author@test.local" });
      const shout = await createShout({ userId: author.id });

      const banned = await createUser({ username: "baduser", email: "bad@test.local" });
      const agent = await authenticatedAgent(banned);

      // Ban after login (banned users can't log in, so ban after acquiring session)
      const prisma = getTestPrisma();
      await prisma.user.update({ where: { id: banned.id }, data: { is_banned: 1 } });

      const res = await agent
        .post(`/api/v1/shouts/${shout.id}/replies`)
        .send({ content: "Spam" });
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/забанены/i);
    });

    it("returns 404 when the shout does not exist", async () => {
      const commenter = await createUser({ username: "commenter", email: "c@test.local" });
      const agent = await authenticatedAgent(commenter);

      const res = await agent
        .post("/api/v1/shouts/nonexistent-id/replies")
        .send({ content: "Hello" });
      expect(res.status).toBe(404);
    });

    it("returns 400 when body has no content and no media", async () => {
      const author = await createUser({ username: "author", email: "author@test.local" });
      const shout = await createShout({ userId: author.id });
      const commenter = await createUser({ username: "commenter", email: "c@test.local" });
      const agent = await authenticatedAgent(commenter);

      const res = await agent
        .post(`/api/v1/shouts/${shout.id}/replies`)
        .send({ content: "" });
      expect(res.status).toBe(400);
    });

    it("returns 200 with comment DTO on success", async () => {
      const author = await createUser({ username: "author", email: "author@test.local" });
      const shout = await createShout({ userId: author.id });
      const commenter = await createUser({ username: "commenter", email: "c@test.local" });
      const agent = await authenticatedAgent(commenter);

      const res = await agent
        .post(`/api/v1/shouts/${shout.id}/replies`)
        .send({ content: "Great post!" });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(typeof res.body.id).toBe("string");

      // Comment should exist in DB
      const prisma = getTestPrisma();
      const comment = await prisma.comment.findUnique({ where: { id: res.body.id } });
      expect(comment).not.toBeNull();
      expect(comment.content).toBe("Great post!");
      expect(comment.user_id).toBe(commenter.id);
      expect(comment.shout_id).toBe(shout.id);
      expect(comment.is_deleted).toBe(0);
    });

    it("allows a media-restricted user to attach an existing image mediaId (reuse of already-stored media, not a new upload)", async () => {
      const author = await createUser({ username: "author", email: "author@test.local" });
      const shout = await createShout({ userId: author.id });
      const commenter = await createUser({ username: "commenter", email: "c@test.local", is_media_allowed: false });
      const media = await createMedia({ userId: commenter.id });
      const agent = await authenticatedAgent(commenter);

      const res = await agent
        .post(`/api/v1/shouts/${shout.id}/replies`)
        .send({ content: "With image", mediaId: media.id });
      expect(res.status).toBe(200);

      const prisma = getTestPrisma();
      const comment = await prisma.comment.findUnique({ where: { id: res.body.id } });
      expect(comment.media_id).toBe(media.id);
    });

    it("allows a media-restricted user to attach a giphy-referenced mediaId (not physically stored on our server)", async () => {
      const author = await createUser({ username: "author", email: "author@test.local" });
      const shout = await createShout({ userId: author.id });
      const commenter = await createUser({ username: "commenter", email: "c@test.local", is_media_allowed: false });
      const media = await createMedia({ userId: commenter.id, mediaType: "giphy", mediaUrl: "abc123", mediaMeta: JSON.stringify({ url: "https://media.giphy.com/media/abc123/giphy.gif", still: "https://media.giphy.com/media/abc123/giphy_s.gif", width: 200, height: 150 }) });
      const agent = await authenticatedAgent(commenter);

      const res = await agent
        .post(`/api/v1/shouts/${shout.id}/replies`)
        .send({ content: "With gif", mediaId: media.id });
      expect(res.status).toBe(200);

      const prisma = getTestPrisma();
      const comment = await prisma.comment.findUnique({ where: { id: res.body.id } });
      expect(comment.media_id).toBe(media.id);
    });

    it("allows a media-restricted user to submit youtubeUrl (not physically stored on our server)", async () => {
      const author = await createUser({ username: "author", email: "author@test.local" });
      const shout = await createShout({ userId: author.id });
      const commenter = await createUser({ username: "commenter", email: "c@test.local", is_media_allowed: false });
      const agent = await authenticatedAgent(commenter);

      const res = await agent
        .post(`/api/v1/shouts/${shout.id}/replies`)
        .send({ content: "Check this out", youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
      expect(res.status).toBe(200);

      const prisma = getTestPrisma();
      const comment = await prisma.comment.findUnique({ where: { id: res.body.id } });
      expect(comment.media_id).toBeTruthy();
      const media = await prisma.media.findUnique({ where: { id: comment.media_id } });
      expect(media.media_type).toBe("youtube");
    });

    it("allows a text-only reply from a media-restricted user", async () => {
      const author = await createUser({ username: "author", email: "author@test.local" });
      const shout = await createShout({ userId: author.id });
      const commenter = await createUser({ username: "commenter", email: "c@test.local", is_media_allowed: false });
      const agent = await authenticatedAgent(commenter);

      const res = await agent
        .post(`/api/v1/shouts/${shout.id}/replies`)
        .send({ content: "Just text, no media" });
      expect(res.status).toBe(200);

      const prisma = getTestPrisma();
      const comment = await prisma.comment.findUnique({ where: { id: res.body.id } });
      expect(comment.content).toBe("Just text, no media");
      expect(comment.media_id).toBeNull();
    });

    it("still auto-converts a YouTube link in content for a media-restricted user", async () => {
      const author = await createUser({ username: "author", email: "author@test.local" });
      const shout = await createShout({ userId: author.id });
      const commenter = await createUser({ username: "commenter", email: "c@test.local", is_media_allowed: false });
      const agent = await authenticatedAgent(commenter);

      const res = await agent
        .post(`/api/v1/shouts/${shout.id}/replies`)
        .send({ content: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
      expect(res.status).toBe(200);

      const prisma = getTestPrisma();
      const comment = await prisma.comment.findUnique({ where: { id: res.body.id } });
      expect(comment.media_id).toBeTruthy();
      const media = await prisma.media.findUnique({ where: { id: comment.media_id } });
      expect(media.media_type).toBe("youtube");
    });

    it("creates a reply notification for the shout author when commenter is different", async () => {
      const author = await createUser({ username: "author", email: "author@test.local" });
      const shout = await createShout({ userId: author.id });
      const commenter = await createUser({ username: "commenter", email: "c@test.local" });
      const agent = await authenticatedAgent(commenter);

      await agent
        .post(`/api/v1/shouts/${shout.id}/replies`)
        .send({ content: "Nice!" })
        .expect(200);

      const prisma = getTestPrisma();
      const notification = await prisma.notification.findFirst({
        where: { user_id: author.id, type: "reply" },
      });
      expect(notification).not.toBeNull();
      expect(notification.actor_id).toBe(commenter.id);
      expect(notification.shout_id).toBe(shout.id);
    });

    it("does NOT create a reply notification when the commenter is the shout author", async () => {
      const author = await createUser({ username: "author", email: "author@test.local" });
      const shout = await createShout({ userId: author.id });
      const agent = await authenticatedAgent(author);

      await agent
        .post(`/api/v1/shouts/${shout.id}/replies`)
        .send({ content: "Replying to myself" })
        .expect(200);

      const prisma = getTestPrisma();
      const notification = await prisma.notification.findFirst({
        where: { user_id: author.id, type: "reply" },
      });
      expect(notification).toBeNull();
    });

    it("creates a mention notification for @mentioned users", async () => {
      const author = await createUser({ username: "author", email: "author@test.local" });
      const shout = await createShout({ userId: author.id });
      const commenter = await createUser({ username: "commenter", email: "c@test.local" });
      const mentioned = await createUser({ username: "mentioned", email: "m@test.local" });
      const agent = await authenticatedAgent(commenter);

      // Use the @[name:id] mention syntax
      await agent
        .post(`/api/v1/shouts/${shout.id}/replies`)
        .send({ content: `Hey @[mentioned:${mentioned.id}] check this out` })
        .expect(200);

      const prisma = getTestPrisma();
      const notification = await prisma.notification.findFirst({
        where: { user_id: mentioned.id, type: "mention" },
      });
      expect(notification).not.toBeNull();
      expect(notification.actor_id).toBe(commenter.id);
      expect(notification.shout_id).toBe(shout.id);
    });

    it("does NOT send a mention notification to the actor (self-mention excluded)", async () => {
      const author = await createUser({ username: "author", email: "author@test.local" });
      const shout = await createShout({ userId: author.id });
      const commenter = await createUser({ username: "commenter", email: "c@test.local" });
      const agent = await authenticatedAgent(commenter);

      // Commenter mentions themselves
      await agent
        .post(`/api/v1/shouts/${shout.id}/replies`)
        .send({ content: `Mentioning myself @[commenter:${commenter.id}]` })
        .expect(200);

      const prisma = getTestPrisma();
      const selfNotif = await prisma.notification.findFirst({
        where: { user_id: commenter.id, type: "mention" },
      });
      expect(selfNotif).toBeNull();
    });

    it("does NOT create a reply notification for the author of a deleted shout", async () => {
      const author = await createUser({ username: "author", email: "author@test.local" });
      const shout = await createShout({ userId: author.id, is_deleted: 1 });
      const commenter = await createUser({ username: "commenter", email: "c@test.local" });
      const agent = await authenticatedAgent(commenter);

      await agent
        .post(`/api/v1/shouts/${shout.id}/replies`)
        .send({ content: "Comment on deleted shout" })
        .expect(200);

      const prisma = getTestPrisma();
      const notification = await prisma.notification.findFirst({
        where: { user_id: author.id, type: "reply" },
      });
      expect(notification).toBeNull();
    });
  });

  // ── DELETE /api/v1/comments/:id ───────────────────────────────────────────

  describe("DELETE /api/v1/comments/:id", () => {
    it("returns 401 when not authenticated", async () => {
      const author = await createUser({ username: "author", email: "author@test.local" });
      const shout = await createShout({ userId: author.id });
      const comment = await createComment({ shoutId: shout.id, userId: author.id });

      const res = await (await request()).delete(`/api/v1/comments/${comment.id}`);
      expect(res.status).toBe(401);
    });

    it("returns 404 when comment does not exist", async () => {
      const user = await createUser({ username: "user", email: "user@test.local" });
      const agent = await authenticatedAgent(user);

      const res = await agent.delete("/api/v1/comments/nonexistent-id");
      expect(res.status).toBe(404);
    });

    it("returns 404 when comment is already soft-deleted", async () => {
      const user = await createUser({ username: "user", email: "user@test.local" });
      const shout = await createShout({ userId: user.id });
      const comment = await createComment({ shoutId: shout.id, userId: user.id, is_deleted: 1 });
      const agent = await authenticatedAgent(user);

      const res = await agent.delete(`/api/v1/comments/${comment.id}`);
      expect(res.status).toBe(404);
    });

    it("returns 403 when trying to delete another user's comment", async () => {
      const author = await createUser({ username: "author", email: "author@test.local" });
      const other = await createUser({ username: "other", email: "other@test.local" });
      const shout = await createShout({ userId: author.id });
      const comment = await createComment({ shoutId: shout.id, userId: author.id });
      const agent = await authenticatedAgent(other);

      const res = await agent.delete(`/api/v1/comments/${comment.id}`);
      expect(res.status).toBe(403);
    });

    it("returns 200 and soft-deletes the comment", async () => {
      const user = await createUser({ username: "user", email: "user@test.local" });
      const shout = await createShout({ userId: user.id });
      const comment = await createComment({ shoutId: shout.id, userId: user.id });
      const agent = await authenticatedAgent(user);

      const res = await agent.delete(`/api/v1/comments/${comment.id}`);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      const prisma = getTestPrisma();
      const deleted = await prisma.comment.findUnique({ where: { id: comment.id } });
      expect(deleted.is_deleted).toBe(1);
    });
  });
});
