import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { enrichFeed } from "../../src/helpers/feed.js";
import { cleanDb, disconnectDb, getTestPrisma } from "../helpers.js";
import {
  createUser, createShout, createComment,
  createShoutLike, createCommentLike, createMedia,
} from "../fixtures/index.js";

describe("enrichFeed", () => {
  beforeEach(async () => {
    await cleanDb();
  });

  afterAll(async () => {
    await cleanDb();
    await disconnectDb();
  });

  /** Fetch shout rows in the same shape the routes pass to enrichFeed */
  async function fetchRaw(ids) {
    return getTestPrisma().shout.findMany({
      where: { id: { in: ids } },
      include: {
        user: { select: { username: true, avatar: true, is_banned: true } },
      },
    });
  }

  // ── basic behaviour ────────────────────────────────────────────────────────

  it("returns an empty array for empty input", async () => {
    const result = await enrichFeed([], null);
    expect(result).toEqual([]);
  });

  it("returns correct DTO shape for a plain shout", async () => {
    const user = await createUser({ username: "alice", email: "alice@test.local" });
    const shout = await createShout({ userId: user.id, content: "Hello!" });

    const rows = await fetchRaw([shout.id]);
    const [dto] = await enrichFeed(rows, null);

    expect(dto).toMatchObject({
      id: shout.id,
      content: "Hello!",
      isDeleted: false,
      likes: 0,
      likedBy: [],
      comments: [],
      visibilityTag: "",
      user: { id: user.id, name: "alice" },
    });
    expect(dto.timestamp).toMatch(/Z$/);
  });

  it("preserves visibilityTag from the shout", async () => {
    const user = await createUser({ username: "alice", email: "alice@test.local" });
    const shout = await createShout({ userId: user.id, content: "Spoiler!" });
    await getTestPrisma().shout.update({
      where: { id: shout.id },
      data: { visibility_tag: "spoiler" },
    });

    const rows = await fetchRaw([shout.id]);
    const [dto] = await enrichFeed(rows, null);
    expect(dto.visibilityTag).toBe("spoiler");
  });

  // ── soft-delete masking ────────────────────────────────────────────────────

  it("masks content and user for a soft-deleted shout", async () => {
    const user = await createUser({ username: "alice", email: "alice@test.local" });
    const shout = await createShout({ userId: user.id, content: "Secret", is_deleted: 1 });

    const rows = await fetchRaw([shout.id]);
    const [dto] = await enrichFeed(rows, null);

    expect(dto.isDeleted).toBe(true);
    expect(dto.content).toBe("");
    expect(dto.user).toBeNull();
    expect(dto.media).toBeUndefined();
  });

  // ── shout likes ───────────────────────────────────────────────────────────

  it("returns the correct shout like count", async () => {
    const user = await createUser({ username: "alice", email: "alice@test.local" });
    const liker1 = await createUser({ username: "b", email: "b@test.local" });
    const liker2 = await createUser({ username: "c", email: "c@test.local" });
    const shout = await createShout({ userId: user.id });
    await createShoutLike({ shoutId: shout.id, userId: liker1.id });
    await createShoutLike({ shoutId: shout.id, userId: liker2.id });

    const rows = await fetchRaw([shout.id]);
    const [dto] = await enrichFeed(rows, null);
    expect(dto.likes).toBe(2);
  });

  it("includes currentUserId in likedBy when they liked the shout", async () => {
    const user = await createUser({ username: "alice", email: "alice@test.local" });
    const viewer = await createUser({ username: "viewer", email: "viewer@test.local" });
    const shout = await createShout({ userId: user.id });
    await createShoutLike({ shoutId: shout.id, userId: viewer.id });

    const rows = await fetchRaw([shout.id]);
    const [dto] = await enrichFeed(rows, viewer.id);
    expect(dto.likedBy).toContain(viewer.id);
  });

  it("likedBy is empty when currentUser has not liked the shout", async () => {
    const user = await createUser({ username: "alice", email: "alice@test.local" });
    const viewer = await createUser({ username: "viewer", email: "viewer@test.local" });
    const shout = await createShout({ userId: user.id });

    const rows = await fetchRaw([shout.id]);
    const [dto] = await enrichFeed(rows, viewer.id);
    expect(dto.likedBy).toEqual([]);
  });

  it("likedBy is empty when currentUserId is null", async () => {
    const user = await createUser({ username: "alice", email: "alice@test.local" });
    const shout = await createShout({ userId: user.id });
    await createShoutLike({ shoutId: shout.id, userId: user.id });

    const rows = await fetchRaw([shout.id]);
    const [dto] = await enrichFeed(rows, null);
    expect(dto.likedBy).toEqual([]);
  });

  // ── comments ──────────────────────────────────────────────────────────────

  it("includes non-deleted comments with correct shape", async () => {
    const author = await createUser({ username: "alice", email: "alice@test.local" });
    const commenter = await createUser({ username: "bob", email: "bob@test.local" });
    const shout = await createShout({ userId: author.id });
    const comment = await createComment({ shoutId: shout.id, userId: commenter.id, content: "Nice!" });

    const rows = await fetchRaw([shout.id]);
    const [dto] = await enrichFeed(rows, null);

    expect(dto.comments).toHaveLength(1);
    expect(dto.comments[0]).toMatchObject({
      id: comment.id,
      shoutId: shout.id,
      content: "Nice!",
      likes: 0,
      likedBy: [],
      user: { id: commenter.id, name: "bob" },
    });
    expect(dto.comments[0].timestamp).toMatch(/Z$/);
  });

  it("excludes soft-deleted comments", async () => {
    const author = await createUser({ username: "alice", email: "alice@test.local" });
    const commenter = await createUser({ username: "bob", email: "bob@test.local" });
    const shout = await createShout({ userId: author.id });
    await createComment({ shoutId: shout.id, userId: commenter.id, is_deleted: 1 });

    const rows = await fetchRaw([shout.id]);
    const [dto] = await enrichFeed(rows, null);
    expect(dto.comments).toHaveLength(0);
  });

  it("returns the correct comment like count", async () => {
    const author = await createUser({ username: "alice", email: "alice@test.local" });
    const commenter = await createUser({ username: "bob", email: "bob@test.local" });
    const liker = await createUser({ username: "liker", email: "liker@test.local" });
    const shout = await createShout({ userId: author.id });
    const comment = await createComment({ shoutId: shout.id, userId: commenter.id });
    await createCommentLike({ commentId: comment.id, userId: liker.id });

    const rows = await fetchRaw([shout.id]);
    const [dto] = await enrichFeed(rows, null);
    expect(dto.comments[0].likes).toBe(1);
  });

  it("includes currentUserId in comment likedBy when they liked it", async () => {
    const author = await createUser({ username: "alice", email: "alice@test.local" });
    const commenter = await createUser({ username: "bob", email: "bob@test.local" });
    const viewer = await createUser({ username: "viewer", email: "viewer@test.local" });
    const shout = await createShout({ userId: author.id });
    const comment = await createComment({ shoutId: shout.id, userId: commenter.id });
    await createCommentLike({ commentId: comment.id, userId: viewer.id });

    const rows = await fetchRaw([shout.id]);
    const [dto] = await enrichFeed(rows, viewer.id);
    expect(dto.comments[0].likedBy).toContain(viewer.id);
  });

  // ── media ─────────────────────────────────────────────────────────────────

  it("includes media DTO on the shout when media is attached", async () => {
    const user = await createUser({ username: "alice", email: "alice@test.local" });
    const media = await createMedia({ userId: user.id });
    const shout = await createShout({ userId: user.id });
    await getTestPrisma().shoutMedia.create({
      data: { shout_id: shout.id, media_id: media.id, position: 0 },
    });

    const rows = await fetchRaw([shout.id]);
    const [dto] = await enrichFeed(rows, null);
    expect(dto.media).toBeDefined();
    expect(dto.media.type).toBe("image");
  });

  it("omits media field when no media is attached", async () => {
    const user = await createUser({ username: "alice", email: "alice@test.local" });
    const shout = await createShout({ userId: user.id });

    const rows = await fetchRaw([shout.id]);
    const [dto] = await enrichFeed(rows, null);
    expect(dto.media).toBeUndefined();
  });

  // ── multiple shouts ────────────────────────────────────────────────────────

  it("handles multiple shouts at once, preserving input order", async () => {
    const user = await createUser({ username: "alice", email: "alice@test.local" });
    const s1 = await createShout({ userId: user.id, content: "First" });
    const s2 = await createShout({ userId: user.id, content: "Second" });
    const s3 = await createShout({ userId: user.id, content: "Third" });

    const rows = await fetchRaw([s1.id, s2.id, s3.id]);
    // fetchRaw may return in any order — sort to match input order
    const ordered = [s1.id, s2.id, s3.id].map(id => rows.find(r => r.id === id));
    const dtos = await enrichFeed(ordered, null);

    expect(dtos).toHaveLength(3);
    expect(dtos[0].content).toBe("First");
    expect(dtos[1].content).toBe("Second");
    expect(dtos[2].content).toBe("Third");
  });

  // ── Gallery DTO contract (feature 006, Stage 1) ────────────────────────────

  describe("galleries", () => {
    /** Attach an ordered list of media directly — the only storage for a post's attachments. */
    async function attachGallery(shoutId, mediaIds) {
      const prisma = getTestPrisma();
      await prisma.shoutMedia.createMany({
        data: mediaIds.map((media_id, position) => ({ shout_id: shoutId, media_id, position })),
      });
    }

    async function makeImages(userId, n) {
      const ids = [];
      for (let i = 0; i < n; i++) {
        const m = await createMedia({ userId, mediaUrl: `uploads/test/f-img${i}.webp` });
        ids.push(m.id);
      }
      return ids;
    }

    // T018 — G1/G2/G3
    it("emits gallery when 2+ items, with gallery[0] deep-equal to media (G1)", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const shout = await createShout({ userId: user.id, content: "gal" });
      const ids = await makeImages(user.id, 3);
      await attachGallery(shout.id, ids);

      const dtos = await enrichFeed(await fetchRaw([shout.id]), null);
      expect(dtos[0].gallery).toHaveLength(3);
      expect(dtos[0].gallery[0]).toEqual(dtos[0].media);
    });

    it("preserves gallery order across repeated calls (G2)", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const shout = await createShout({ userId: user.id, content: "gal" });
      const ids = await makeImages(user.id, 4);
      await attachGallery(shout.id, ids);

      const first = await enrichFeed(await fetchRaw([shout.id]), null);
      const second = await enrichFeed(await fetchRaw([shout.id]), null);
      const urls = (d) => d[0].gallery.map((g) => g.url);
      expect(urls(first)).toEqual(urls(second));
      expect(urls(first)).toHaveLength(4);
    });

    // T019 — regression guard, FR-016 / FR-032 / SC-006
    it("omits gallery entirely for a single-media shout (FR-016)", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const media = await createMedia({ userId: user.id });
      const shout = await createShout({ userId: user.id, content: "one" });
      await attachGallery(shout.id, [media.id]);

      const dtos = await enrichFeed(await fetchRaw([shout.id]), null);
      expect(dtos[0].gallery).toBeUndefined();
      expect(dtos[0].media).toBeDefined();
      expect(dtos[0].media.type).toBe("image");
    });

    it("suppresses gallery for a soft-deleted shout (G6)", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const shout = await createShout({ userId: user.id, content: "gone", is_deleted: 1 });
      const ids = await makeImages(user.id, 2);
      await attachGallery(shout.id, ids);

      const dtos = await enrichFeed(await fetchRaw([shout.id]), null);
      expect(dtos[0].gallery).toBeUndefined();
      expect(dtos[0].media).toBeUndefined();
    });

    it("emits galleries on comments too (FR-031)", async () => {
      const prisma = getTestPrisma();
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const shout = await createShout({ userId: user.id, content: "host" });
      const comment = await createComment({ shoutId: shout.id, userId: user.id, content: "c" });
      const ids = await makeImages(user.id, 2);
      await prisma.commentMedia.createMany({
        data: ids.map((media_id, position) => ({ comment_id: comment.id, media_id, position })),
      });

      const dtos = await enrichFeed(await fetchRaw([shout.id]), null);
      expect(dtos[0].comments[0].gallery).toHaveLength(2);
      expect(dtos[0].comments[0].gallery[0]).toEqual(dtos[0].comments[0].media);
    });
  });
});
