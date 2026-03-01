import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import sharp from "sharp";
import { request, authenticatedAgent, cleanDb, disconnectDb, getTestPrisma } from "../helpers.js";
import { createUser } from "../fixtures/index.js";

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
});
