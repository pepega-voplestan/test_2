import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { request, authenticatedAgent, cleanDb, disconnectDb, getTestPrisma } from "../helpers.js";
import { createUser, createShout, createMedia, createComment } from "../fixtures/index.js";

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

    it("returns soft-deleted shouts with comments as isDeleted: true and masked content", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const deletedShout = await createShout({ userId: user.id, content: "Deleted shout", is_deleted: 1 });
      await createComment({ shoutId: deletedShout.id, userId: user.id });
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

    it("excludes soft-deleted shouts with zero comments entirely", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      await createShout({ userId: user.id, content: "Deleted shout", is_deleted: 1 });
      await createShout({ userId: user.id, content: "Visible shout" });

      const res = await (await request()).get("/api/v1/shouts");
      expect(res.status).toBe(200);
      expect(res.body.shouts).toHaveLength(1);
      expect(res.body.shouts[0].content).toBe("Visible shout");
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

    it("returns shout with isDeleted: true and masked fields when soft-deleted with comments", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const shout = await createShout({ userId: user.id, content: "Secret", is_deleted: 1 });
      await createComment({ shoutId: shout.id, userId: user.id });

      const res = await (await request()).get(`/api/v1/shouts/${shout.id}`);
      expect(res.status).toBe(200);
      expect(res.body.shout.isDeleted).toBe(true);
      expect(res.body.shout.content).toBe("");
      expect(res.body.shout.user).toBeNull();
    });

    it("returns 404 for a soft-deleted shout with zero comments", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const shout = await createShout({ userId: user.id, content: "Secret", is_deleted: 1 });

      const res = await (await request()).get(`/api/v1/shouts/${shout.id}`);
      expect(res.status).toBe(404);
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

    it("broadcasts remove_shout and fully hides a zero-comment shout on delete", async () => {
      const { broadcast } = await import("../../src/sse.js");
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const shout = await createShout({ userId: user.id });
      const agent = await authenticatedAgent(user);

      const res = await agent.delete(`/api/v1/shouts/${shout.id}`);
      expect(res.status).toBe(200);
      expect(broadcast).toHaveBeenCalledWith("remove_shout", { shoutId: shout.id, userId: user.id });
      expect(broadcast).not.toHaveBeenCalledWith("delete_shout", expect.anything());

      const feedRes = await (await request()).get("/api/v1/shouts");
      expect(feedRes.body.shouts.find((s) => s.id === shout.id)).toBeUndefined();

      const singleRes = await (await request()).get(`/api/v1/shouts/${shout.id}`);
      expect(singleRes.status).toBe(404);
    });

    it("broadcasts delete_shout and keeps a has-comments shout as a placeholder on delete", async () => {
      const { broadcast } = await import("../../src/sse.js");
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const shout = await createShout({ userId: user.id });
      await createComment({ shoutId: shout.id, userId: user.id });
      const agent = await authenticatedAgent(user);

      const res = await agent.delete(`/api/v1/shouts/${shout.id}`);
      expect(res.status).toBe(200);
      expect(broadcast).toHaveBeenCalledWith("delete_shout", { shoutId: shout.id, userId: user.id });
      expect(broadcast).not.toHaveBeenCalledWith("remove_shout", expect.anything());

      const feedRes = await (await request()).get("/api/v1/shouts");
      const feedShout = feedRes.body.shouts.find((s) => s.id === shout.id);
      expect(feedShout).toBeDefined();
      expect(feedShout.isDeleted).toBe(true);
      expect(feedShout.content).toBe("");
      expect(feedShout.user).toBeNull();

      const singleRes = await (await request()).get(`/api/v1/shouts/${shout.id}`);
      expect(singleRes.status).toBe(200);
      expect(singleRes.body.shout.isDeleted).toBe(true);
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

      const res = await agent.post("/api/v1/shouts").send({ content: "x".repeat(1001) });
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

    // Feature 008 (FR-013): the media row outlives its files, so a composer
    // held open past the grace period still holds a resolvable id.
    describe("attaching media whose files were reclaimed", () => {
      const reclaimedMeta = JSON.stringify({
        w: 320,
        h: 240,
        animated: false,
        reclaimed: { files: true, at: "2026-08-01T00:00:00.000Z" },
      });

      it("rejects the publish with the Russian message and creates no shout", async () => {
        const user = await createUser({ username: "alice", email: "alice@test.local" });
        const media = await createMedia({ userId: user.id, mediaMeta: reclaimedMeta });
        const agent = await authenticatedAgent(user);

        const res = await agent.post("/api/v1/shouts").send({
          content: "With a reclaimed image",
          mediaId: media.id,
        });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Файл больше недоступен. Загрузите его заново");
        expect(await getTestPrisma().shout.count()).toBe(0);
      });

      it("rejects the whole gallery when only one item was reclaimed", async () => {
        const user = await createUser({ username: "alice", email: "alice@test.local" });
        const ok = await createMedia({ userId: user.id, mediaUrl: "uploads/test/ok.webp" });
        const gone = await createMedia({ userId: user.id, mediaUrl: "uploads/test/gone.webp", mediaMeta: reclaimedMeta });
        const agent = await authenticatedAgent(user);

        const res = await agent.post("/api/v1/shouts").send({
          content: "Half a gallery",
          mediaIds: [ok.id, gone.id],
        });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Файл больше недоступен. Загрузите его заново");
        expect(await getTestPrisma().shout.count()).toBe(0);
        expect(await getTestPrisma().shoutMedia.count()).toBe(0);
      });

      it("still accepts media carrying an unrelated reclaim marker", async () => {
        const user = await createUser({ username: "alice", email: "alice@test.local" });
        // Only variants were reclaimed — the media still renders.
        const media = await createMedia({
          userId: user.id,
          mediaMeta: JSON.stringify({ w: 320, h: 240, reclaimed: { variants: ["320"], at: "2026-08-01T00:00:00.000Z" } }),
        });
        const agent = await authenticatedAgent(user);

        const res = await agent.post("/api/v1/shouts").send({ content: "Fine", mediaId: media.id });
        expect(res.status).toBe(200);
      });
    });

    it("allows a media-restricted user to attach an existing image mediaId (reuse of already-stored media, not a new upload)", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local", is_media_allowed: false });
      const media = await createMedia({ userId: user.id });
      const agent = await authenticatedAgent(user);

      const res = await agent.post("/api/v1/shouts").send({ content: "With image", mediaId: media.id });
      expect(res.status).toBe(200);
      expect(res.body.shout.media).toBeDefined();
      expect(res.body.shout.media.type).toBe("image");
    });

    it("allows a media-restricted user to attach a giphy-referenced mediaId (not physically stored on our server)", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local", is_media_allowed: false });
      const media = await createMedia({ userId: user.id, mediaType: "giphy", mediaUrl: "abc123", mediaMeta: JSON.stringify({ url: "https://media.giphy.com/media/abc123/giphy.gif", still: "https://media.giphy.com/media/abc123/giphy_s.gif", width: 200, height: 150 }) });
      const agent = await authenticatedAgent(user);

      const res = await agent.post("/api/v1/shouts").send({ content: "With gif", mediaId: media.id });
      expect(res.status).toBe(200);
      expect(res.body.shout.media).toBeDefined();
      expect(res.body.shout.media.type).toBe("giphy");
    });

    it("allows a media-restricted user to submit youtubeUrl (not physically stored on our server)", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local", is_media_allowed: false });
      const agent = await authenticatedAgent(user);

      const res = await agent.post("/api/v1/shouts").send({ content: "Check this out", youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
      expect(res.status).toBe(200);
      expect(res.body.shout.media).toBeDefined();
      expect(res.body.shout.media.type).toBe("youtube");
    });

    it("allows a text-only submission from a media-restricted user", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local", is_media_allowed: false });
      const agent = await authenticatedAgent(user);

      const res = await agent.post("/api/v1/shouts").send({ content: "Just text, no media" });
      expect(res.status).toBe(200);
      expect(res.body.shout.content).toBe("Just text, no media");
      expect(res.body.shout.media).toBeUndefined();
    });

    it("still auto-converts a YouTube link in content for a media-restricted user", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local", is_media_allowed: false });
      const agent = await authenticatedAgent(user);

      const res = await agent.post("/api/v1/shouts").send({ content: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
      expect(res.status).toBe(200);
      expect(res.body.shout.media).toBeDefined();
      expect(res.body.shout.media.type).toBe("youtube");

      const row = await getTestPrisma().shoutMedia.findFirst({ where: { shout_id: res.body.id, position: 0 } });
      expect(row).toBeTruthy();
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

  // ── Multi-media galleries (feature 006, Stage 1) ───────────────────────────

  describe("POST /api/v1/shouts — galleries", () => {
    /** Create `n` image media rows owned by `userId`, returning their ids in order. */
    async function makeImages(userId, n) {
      const ids = [];
      for (let i = 0; i < n; i++) {
        const m = await createMedia({ userId, mediaUrl: `uploads/test/img${i}.webp` });
        ids.push(m.id);
      }
      return ids;
    }

    // T015 — creation rules R1–R6
    it("accepts a gallery of 5 images", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);
      const ids = await makeImages(user.id, 5);

      const res = await agent.post("/api/v1/shouts").send({ content: "five", mediaIds: ids });
      expect(res.status).toBe(200);

      const rows = await getTestPrisma().shoutMedia.findMany({
        where: { shout_id: res.body.shout.id },
        orderBy: { position: "asc" },
      });
      expect(rows.map((r) => r.media_id)).toEqual(ids);
      expect(rows.map((r) => r.position)).toEqual([0, 1, 2, 3, 4]);
    });

    it("rejects a gallery of 6 images (R2)", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);
      const ids = await makeImages(user.id, 6);

      const res = await agent.post("/api/v1/shouts").send({ content: "six", mediaIds: ids });
      expect(res.status).toBe(400);
      // Must name the attachment limit, NOT the character limit — a Zod `too_big`
      // on mediaIds previously borrowed the "Максимум 1000 символов" message.
      expect(res.body.error).toBe("Можно прикрепить не более 5 файлов");
      expect(await getTestPrisma().shoutMedia.count()).toBe(0);
    });

    it("rejects mediaId and mediaIds sent together (R1)", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);
      const [a, b] = await makeImages(user.id, 2);

      const res = await agent.post("/api/v1/shouts").send({ content: "both", mediaId: a, mediaIds: [b] });
      expect(res.status).toBe(400);
    });

    it("rejects a gallery combined with youtubeUrl (R3)", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);
      const ids = await makeImages(user.id, 2);

      const res = await agent.post("/api/v1/shouts").send({
        content: "mix",
        mediaIds: ids,
        youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      });
      expect(res.status).toBe(400);
    });

    it("rejects an unknown media id (R4)", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);
      const [real] = await makeImages(user.id, 1);

      const res = await agent.post("/api/v1/shouts").send({
        content: "ghost",
        mediaIds: [real, "11111111-2222-3333-4444-555555555555"],
      });
      expect(res.status).toBe(400);
      expect(await getTestPrisma().shoutMedia.count()).toBe(0);
    });

    it("rejects non-image media in a gallery (R5)", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);
      const [img] = await makeImages(user.id, 1);
      const vid = await createMedia({ userId: user.id, mediaType: "video", mediaUrl: "uploads/test/v.mp4" });

      const res = await agent.post("/api/v1/shouts").send({ content: "vid", mediaIds: [img, vid.id] });
      expect(res.status).toBe(400);
    });

    // 2026-07-31 revision (research D19): a Giphy-picker GIF (media_type
    // "giphy") was always rejected by R5's media_type check. An uploaded
    // animated GIF file is stored as media_type "image" with its animated-ness
    // only in media_meta, so it slipped past that same check until this fix.
    it("rejects an uploaded animated GIF file in a gallery, closing the media_meta gap (R5)", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);
      const [img] = await makeImages(user.id, 1);
      const uploadedGif = await createMedia({
        userId: user.id,
        mediaType: "image",
        mediaUrl: "uploads/test/animated.webp",
        mediaMeta: JSON.stringify({ w: 320, h: 240, size: 2048, mime: "image/gif", animated: true }),
      });

      const res = await agent.post("/api/v1/shouts").send({ content: "gif", mediaIds: [img, uploadedGif.id] });
      expect(res.status).toBe(400);
      expect(await getTestPrisma().shoutMedia.count()).toBe(0);
    });

    it("still rejects a Giphy-picker GIF (media_type \"giphy\") in a gallery (R5)", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);
      const [img] = await makeImages(user.id, 1);
      const giphyGif = await createMedia({ userId: user.id, mediaType: "giphy", mediaUrl: "https://giphy.com/test.gif" });

      const res = await agent.post("/api/v1/shouts").send({ content: "gif", mediaIds: [img, giphyGif.id] });
      expect(res.status).toBe(400);
    });

    it("rejects duplicate media ids (R6)", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);
      const [a] = await makeImages(user.id, 1);

      const res = await agent.post("/api/v1/shouts").send({ content: "dup", mediaIds: [a, a] });
      expect(res.status).toBe(400);
    });

    it("treats a legacy single mediaId as a one-item gallery", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);
      const [only] = await makeImages(user.id, 1);

      const res = await agent.post("/api/v1/shouts").send({ content: "one", mediaId: only });
      expect(res.status).toBe(200);

      const rows = await getTestPrisma().shoutMedia.findMany({ where: { shout_id: res.body.shout.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0].position).toBe(0);
      expect(rows[0].media_id).toBe(only);
    });

    // T020 — create-response / SSE DTO shape
    it("returns gallery in the create response when 2+ items (G1)", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);
      const ids = await makeImages(user.id, 3);

      const res = await agent.post("/api/v1/shouts").send({ content: "g", mediaIds: ids });
      expect(res.body.shout.gallery).toHaveLength(3);
      expect(res.body.shout.gallery[0]).toEqual(res.body.shout.media);
    });

    it("omits gallery from the create response for a single item (FR-016)", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);
      const [only] = await makeImages(user.id, 1);

      const res = await agent.post("/api/v1/shouts").send({ content: "one", mediaId: only });
      expect(res.body.shout.gallery).toBeUndefined();
      expect(res.body.shout.media).toBeDefined();
    });

    // T039 — visibility_tag applies to the whole gallery
    it("keeps a spoiler tag when a gallery is attached (FR-030)", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);
      const ids = await makeImages(user.id, 2);

      const res = await agent.post("/api/v1/shouts").send({
        content: "spoiler gallery",
        mediaIds: ids,
        visibilityTag: "spoiler",
      });
      expect(res.status).toBe(200);
      expect(res.body.shout.visibilityTag).toBe("spoiler");
    });

    // T040 — immutability
    it("does not accept mediaIds on edit (FR-029)", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);
      const ids = await makeImages(user.id, 2);
      const created = await agent.post("/api/v1/shouts").send({ content: "orig", mediaIds: ids });
      const shoutId = created.body.shout.id;

      const extra = await createMedia({ userId: user.id, mediaUrl: "uploads/test/extra.webp" });
      await agent.put(`/api/v1/shouts/${shoutId}`).send({ content: "edited", mediaIds: [extra.id] });

      const rows = await getTestPrisma().shoutMedia.findMany({ where: { shout_id: shoutId } });
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.media_id).sort()).toEqual([...ids].sort());
    });
  });
});
