import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { request, authenticatedAgent, cleanDb, disconnectDb, getTestPrisma } from "../helpers.js";
import { createUser } from "../fixtures/index.js";

const MEDIA_DIR = process.env.MEDIA_PATH;

/** Absolute path to a file inside a stored media asset's directory. */
function mediaFile(mediaId, name) {
  return path.join(MEDIA_DIR, mediaId, name);
}

/** Generate a minimal valid JPEG buffer of the given dimensions */
async function makeJpeg(width = 300, height = 300) {
  return sharp({
    create: { width, height, channels: 3, background: { r: 100, g: 150, b: 200 } },
  })
    .jpeg({ quality: 80 })
    .toBuffer();
}

/** Generate a minimal valid PNG buffer of the given dimensions */
async function makePng(width = 300, height = 300) {
  return sharp({
    create: { width, height, channels: 3, background: { r: 100, g: 150, b: 200 } },
  })
    .png()
    .toBuffer();
}

describe("Upload routes", () => {
  beforeEach(async () => {
    await cleanDb();
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await cleanDb();
    await disconnectDb();
  });

  // ── POST /api/v1/upload/media ─────────────────────────────────────────────

  describe("POST /api/v1/upload/media", () => {
    it("returns 401 when not authenticated", async () => {
      const res = await (await request()).post("/api/v1/upload/media");
      expect(res.status).toBe(401);
    });

    it("returns 400 when no file is attached", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);

      const res = await agent.post("/api/v1/upload/media");
      expect(res.status).toBe(400);
    });

    it("returns 403 and discards the file when the user is media-restricted", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local", is_media_allowed: false });
      const agent = await authenticatedAgent(user);
      const imgBuf = await makeJpeg(400, 300);

      const res = await agent
        .post("/api/v1/upload/media")
        .attach("file", imgBuf, { filename: "photo.jpg", contentType: "image/jpeg" });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("Вам запрещено прикреплять медиафайлы");

      const rows = await getTestPrisma().media.findMany({ where: { user_id: user.id } });
      expect(rows).toHaveLength(0);
    });

    it("returns 400 for a disallowed MIME type", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);

      const res = await agent
        .post("/api/v1/upload/media")
        .attach("file", Buffer.from("not an image"), { filename: "test.txt", contentType: "text/plain" });
      expect(res.status).toBe(400);
    });

    it("returns 200 and media record for a valid JPEG upload", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);
      const imgBuf = await makeJpeg(400, 300);

      const res = await agent
        .post("/api/v1/upload/media")
        .attach("file", imgBuf, { filename: "photo.jpg", contentType: "image/jpeg" });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(typeof res.body.mediaId).toBe("string");
      expect(res.body.urls).toMatchObject({
        thumb: expect.stringContaining("/media/"),
        medium: expect.stringContaining("/media/"),
        full: expect.stringContaining("/media/"),
      });

      // Verify DB record was created
      const row = await getTestPrisma().media.findUnique({ where: { id: res.body.mediaId } });
      expect(row).not.toBeNull();
      expect(row.user_id).toBe(user.id);
      expect(row.media_type).toBe("image");
    });

    it("returns 200 and media record for a valid PNG upload", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);
      const imgBuf = await makePng(500, 400);

      const res = await agent
        .post("/api/v1/upload/media")
        .attach("file", imgBuf, { filename: "photo.png", contentType: "image/png" });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(typeof res.body.mediaId).toBe("string");
    });

    // ── Original-quality path (feature 003) ─────────────────────────────────

    it("stores a lossless original.jpg and WebP variants for a JPEG (US1)", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);
      const imgBuf = await makeJpeg(600, 400);

      const res = await agent
        .post("/api/v1/upload/media")
        .attach("file", imgBuf, { filename: "photo.jpg", contentType: "image/jpeg" });

      expect(res.status).toBe(200);
      const { mediaId } = res.body;

      // Original + all WebP variants exist on disk.
      expect(fs.existsSync(mediaFile(mediaId, "original.jpg"))).toBe(true);
      for (const w of [320, 960, 1600]) {
        expect(fs.existsSync(mediaFile(mediaId, `${w}.webp`))).toBe(true);
      }
      // Full URL points at the original during the window.
      expect(res.body.urls.full).toBe(`/media/${mediaId}/original.jpg`);

      // media_meta records the pending-original state.
      const row = await getTestPrisma().media.findUnique({ where: { id: mediaId } });
      const meta = JSON.parse(row.media_meta);
      expect(meta.orig).toBe("original.jpg");
      expect(meta.converted).toBe(false);
      expect(typeof meta.uploaded_at).toBe("string");
      expect(Number.isNaN(Date.parse(meta.uploaded_at))).toBe(false);
    });

    it("stores a lossless original.png for a PNG (US1)", async () => {
      const user = await createUser({ username: "bob", email: "bob@test.local" });
      const agent = await authenticatedAgent(user);
      const imgBuf = await makePng(500, 400);

      const res = await agent
        .post("/api/v1/upload/media")
        .attach("file", imgBuf, { filename: "photo.png", contentType: "image/png" });

      expect(res.status).toBe(200);
      const { mediaId } = res.body;
      expect(fs.existsSync(mediaFile(mediaId, "original.png"))).toBe(true);
      expect(res.body.urls.full).toBe(`/media/${mediaId}/original.png`);

      const row = await getTestPrisma().media.findUnique({ where: { id: mediaId } });
      expect(JSON.parse(row.media_meta).orig).toBe("original.png");
    });

    it("strips privacy metadata from the stored original (FR-013)", async () => {
      const user = await createUser({ username: "carol", email: "carol@test.local" });
      const agent = await authenticatedAgent(user);
      const base = await makeJpeg(300, 200);
      const withExif = await sharp(base)
        .withExif({ IFD0: { Copyright: "ACME", Software: "SecretCam 9000" } })
        .toBuffer();

      const res = await agent
        .post("/api/v1/upload/media")
        .attach("file", withExif, { filename: "gps.jpg", contentType: "image/jpeg" });

      expect(res.status).toBe(200);
      const stored = fs.readFileSync(mediaFile(res.body.mediaId, "original.jpg"));
      const meta = await sharp(stored).metadata();
      expect(meta.exif).toBeUndefined();
    });

    it("creates exactly one media row — single-media invariant intact (FR-010)", async () => {
      const user = await createUser({ username: "dave", email: "dave@test.local" });
      const agent = await authenticatedAgent(user);
      const imgBuf = await makeJpeg(300, 300);

      const res = await agent
        .post("/api/v1/upload/media")
        .attach("file", imgBuf, { filename: "one.jpg", contentType: "image/jpeg" });

      expect(res.status).toBe(200);
      expect(typeof res.body.mediaId).toBe("string");
      const count = await getTestPrisma().media.count({ where: { user_id: user.id } });
      expect(count).toBe(1);
    });

    it("rejects an oversized upload with a Russian message and stores nothing (US3, FR-002/003)", async () => {
      const user = await createUser({ username: "erin", email: "erin@test.local" });
      const agent = await authenticatedAgent(user);
      // 11 MB — above the 10 MB default limit. Multer rejects on size before storage.
      const tooBig = Buffer.alloc(11 * 1024 * 1024, 0);

      const before = await getTestPrisma().media.count();
      const res = await agent
        .post("/api/v1/upload/media")
        .attach("file", tooBig, { filename: "huge.jpg", contentType: "image/jpeg" });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Файл слишком большой");
      expect(res.body.error).toContain("МБ");
      const after = await getTestPrisma().media.count();
      expect(after).toBe(before); // nothing persisted
    });

    it("rejects a corrupt image with a Russian message and stores nothing (US3, FR-003)", async () => {
      const user = await createUser({ username: "frank", email: "frank@test.local" });
      const agent = await authenticatedAgent(user);
      // Valid JPEG mime but garbage bytes — sharp cannot decode it.
      const corrupt = Buffer.from("this is definitely not a real jpeg payload");

      const before = await getTestPrisma().media.count();
      const res = await agent
        .post("/api/v1/upload/media")
        .attach("file", corrupt, { filename: "broken.jpg", contentType: "image/jpeg" });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/[А-Яа-я]/); // Russian message
      const after = await getTestPrisma().media.count();
      expect(after).toBe(before);
    });

    it("accepts authenticated uploads and rejects unauthenticated (FR-012 auth states)", async () => {
      // Rate limiting itself is disabled in the test harness (isTest); this asserts
      // the endpoint's auth-state behavior, the guard the limiter keys off of.
      const anon = await request();
      const anonRes = await anon
        .post("/api/v1/upload/media")
        .attach("file", await makeJpeg(200, 200), { filename: "a.jpg", contentType: "image/jpeg" });
      expect(anonRes.status).toBe(401);

      const user = await createUser({ username: "grace", email: "grace@test.local" });
      const agent = await authenticatedAgent(user);
      const authRes = await agent
        .post("/api/v1/upload/media")
        .attach("file", await makeJpeg(200, 200), { filename: "a.jpg", contentType: "image/jpeg" });
      expect(authRes.status).toBe(200);
    });
  });

  // ── POST /api/v1/upload/avatar ────────────────────────────────────────────

  describe("POST /api/v1/upload/avatar", () => {
    it("returns 401 when not authenticated", async () => {
      const res = await (await request()).post("/api/v1/upload/avatar");
      expect(res.status).toBe(401);
    });

    it("returns 400 when no file is attached", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);

      const res = await agent.post("/api/v1/upload/avatar");
      expect(res.status).toBe(400);
    });

    it("returns 400 for a disallowed MIME type", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);

      const res = await agent
        .post("/api/v1/upload/avatar")
        .attach("avatar", Buffer.from("not an image"), { filename: "test.gif", contentType: "image/gif" });
      expect(res.status).toBe(400);
    });

    it("returns 400 when image is smaller than 256×256", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);
      const smallBuf = await makeJpeg(100, 100);

      const res = await agent
        .post("/api/v1/upload/avatar")
        .attach("avatar", smallBuf, { filename: "small.jpg", contentType: "image/jpeg" });

      expect(res.status).toBe(400);
    });

    it("succeeds for a media-restricted user (avatar upload is out of scope for the restriction)", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local", is_media_allowed: false });
      const agent = await authenticatedAgent(user);
      const imgBuf = await makeJpeg(300, 300);

      const res = await agent
        .post("/api/v1/upload/avatar")
        .attach("avatar", imgBuf, { filename: "avatar.jpg", contentType: "image/jpeg" });

      expect(res.status).toBe(200);
    });

    it("returns 200 and updates user avatar for a valid upload", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);
      const imgBuf = await makeJpeg(300, 300);

      const res = await agent
        .post("/api/v1/upload/avatar")
        .attach("avatar", imgBuf, { filename: "avatar.jpg", contentType: "image/jpeg" });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(typeof res.body.avatar).toBe("string");
      expect(res.body.avatar).toContain("/api/v1/avatars/");
      expect(res.body.sizes).toMatchObject({
        64: expect.stringContaining("/api/v1/avatars/"),
        128: expect.stringContaining("/api/v1/avatars/"),
        256: expect.stringContaining("/api/v1/avatars/"),
      });

      // Verify user avatar was updated in DB
      const row = await getTestPrisma().user.findUnique({ where: { id: user.id } });
      expect(row.avatar).toContain("/api/v1/avatars/");
    });
  });

  // ── Multi-file upload for galleries (feature 006, Stage 1) ────────────────
  //
  // There is deliberately NO batch endpoint: a gallery is built by calling this
  // same per-file endpoint N times (research D2). These tests pin the properties
  // that decision relies on.

  describe("POST /api/v1/upload/media — multi-file (gallery) usage", () => {
    // T021 — FR-008: rate limiting applies in BOTH auth states (constitution MUST)
    it("requires authentication for every file in a batch (unauthenticated state)", async () => {
      const imgBuf = await makeJpeg();
      const anon = await request();

      for (let i = 0; i < 3; i++) {
        const res = await anon
          .post("/api/v1/upload/media")
          .attach("file", imgBuf, { filename: `p${i}.jpg`, contentType: "image/jpeg" });
        expect(res.status).toBe(401);
      }
      // Nothing stored: an unauthenticated caller can never build a gallery.
      expect(await getTestPrisma().media.count()).toBe(0);
    });

    it("accepts 5 sequential uploads by one authenticated user (authenticated state)", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);
      const imgBuf = await makeJpeg();

      const ids = [];
      for (let i = 0; i < 5; i++) {
        const res = await agent
          .post("/api/v1/upload/media")
          .attach("file", imgBuf, { filename: `p${i}.jpg`, contentType: "image/jpeg" });
        expect(res.status).toBe(200);
        ids.push(res.body.mediaId);
      }

      // Each file is an independent Media row — this is what lets a partial
      // failure keep the successes (FR-034).
      expect(new Set(ids).size).toBe(5);
      expect(await getTestPrisma().media.count()).toBe(5);
    });

    it("fails only the offending file in a mixed batch, keeping successes (FR-034)", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);
      const imgBuf = await makeJpeg();

      const ok1 = await agent
        .post("/api/v1/upload/media")
        .attach("file", imgBuf, { filename: "good1.jpg", contentType: "image/jpeg" });
      const bad = await agent
        .post("/api/v1/upload/media")
        .attach("file", Buffer.from("not an image"), { filename: "bad.txt", contentType: "text/plain" });
      const ok2 = await agent
        .post("/api/v1/upload/media")
        .attach("file", imgBuf, { filename: "good2.jpg", contentType: "image/jpeg" });

      expect(ok1.status).toBe(200);
      expect(bad.status).toBe(400);
      expect(ok2.status).toBe(200);
      // The bad file did not roll back the good ones.
      expect(await getTestPrisma().media.count()).toBe(2);
    });

    // T022 — FR-009 (as reworded): restriction bites at upload time
    it("blocks every file of a multi-file attempt for a restricted user (FR-009)", async () => {
      const user = await createUser({
        username: "restricted",
        email: "restricted@test.local",
        is_media_allowed: false,
      });
      const agent = await authenticatedAgent(user);
      const imgBuf = await makeJpeg();

      for (let i = 0; i < 3; i++) {
        const res = await agent
          .post("/api/v1/upload/media")
          .attach("file", imgBuf, { filename: `p${i}.jpg`, contentType: "image/jpeg" });
        expect(res.status).toBe(403);
        expect(res.body.error).toBe("Вам запрещено прикреплять медиафайлы");
      }

      // No media stored at all, so no gallery can be formed downstream.
      expect(await getTestPrisma().media.count()).toBe(0);
    });
  });
});
