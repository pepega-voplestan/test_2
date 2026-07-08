import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import crypto from "crypto";
import sharp from "sharp";
import { request, authenticatedAgent, cleanDb, disconnectDb, getTestPrisma } from "../helpers.js";
import { createUser } from "../fixtures/index.js";

/** Generate a minimal valid GIF buffer of the given dimensions */
async function makeGif(width = 10, height = 10) {
  return sharp({
    create: { width, height, channels: 3, background: { r: 100, g: 150, b: 200 } },
  }).gif().toBuffer();
}

function sampleGiphyGif(id = "abc123") {
  return {
    id,
    title: "Test GIF",
    images: {
      fixed_height: { url: `https://media.giphy.com/media/${id}/giphy.gif`, width: "200", height: "150" },
      fixed_height_still: { url: `https://media.giphy.com/media/${id}/giphy_s.gif` },
    },
  };
}

function mockGiphyOk(dataArr, extra = {}) {
  return {
    ok: true,
    json: async () => ({ data: dataArr, pagination: { total_count: dataArr.length }, ...extra }),
  };
}

describe("GIF routes (/api/v1/gifs)", () => {
  const originalKey = process.env.GIPHY_API_KEY;
  let fetchSpy;

  beforeEach(async () => {
    await cleanDb();
    vi.clearAllMocks();
    delete process.env.GIPHY_API_KEY;
  });

  afterEach(() => {
    if (fetchSpy) { fetchSpy.mockRestore(); fetchSpy = undefined; }
  });

  afterAll(async () => {
    await cleanDb();
    await disconnectDb();
    if (originalKey) process.env.GIPHY_API_KEY = originalKey;
    else delete process.env.GIPHY_API_KEY;
  });

  // ── GET /gifs/search ─────────────────────────────────────────────────────

  describe("GET /gifs/search", () => {
    it("returns 400 when q is missing", async () => {
      const res = await (await request()).get("/api/v1/gifs/search");
      expect(res.status).toBe(400);
    });

    it("returns 503 when GIPHY_API_KEY is not configured", async () => {
      const res = await (await request()).get("/api/v1/gifs/search?q=cat");
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ error: "GIF-сервис недоступен" });
    });

    it("returns mapped gif results on success", async () => {
      process.env.GIPHY_API_KEY = "test-key";
      fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(mockGiphyOk([sampleGiphyGif("s1")]));

      const res = await (await request()).get("/api/v1/gifs/search?q=cat&limit=11");
      expect(res.status).toBe(200);
      expect(res.body.gifs).toHaveLength(1);
      expect(res.body.gifs[0]).toMatchObject({
        id: "s1",
        url: "https://media.giphy.com/media/s1/giphy.gif",
        still: "https://media.giphy.com/media/s1/giphy_s.gif",
        width: 200,
        height: 150,
      });
      expect(res.body.total).toBe(1);
    });

    it("is accessible without authentication", async () => {
      const res = await (await request()).get("/api/v1/gifs/search?q=cat");
      // 503 (no key) rather than 401 — proves no auth gate on this route
      expect(res.status).toBe(503);
    });
  });

  // ── GET /gifs/trending ───────────────────────────────────────────────────

  describe("GET /gifs/trending", () => {
    it("returns 503 when GIPHY_API_KEY is not configured", async () => {
      const res = await (await request()).get("/api/v1/gifs/trending");
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ error: "GIF-сервис недоступен" });
    });

    it("returns gifs and serves subsequent identical requests from cache", async () => {
      process.env.GIPHY_API_KEY = "test-key";
      fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(mockGiphyOk([sampleGiphyGif("t1")]));

      const r1 = await (await request()).get("/api/v1/gifs/trending?limit=13");
      expect(r1.status).toBe(200);
      expect(r1.body.gifs).toHaveLength(1);

      const r2 = await (await request()).get("/api/v1/gifs/trending?limit=13");
      expect(r2.status).toBe(200);
      expect(r2.body).toEqual(r1.body);

      // Only one real Giphy call — second request was served from the in-memory cache
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ── POST /gifs/reference ────────────────────────────────────────────────

  describe("POST /gifs/reference", () => {
    const validBody = {
      giphyId: "abc123",
      giphyUrl: "https://media.giphy.com/media/abc123/giphy.gif",
      giphyStill: "https://media.giphy.com/media/abc123/giphy_s.gif",
      width: 200,
      height: 150,
    };

    it("returns 401 when not authenticated", async () => {
      const res = await (await request()).post("/api/v1/gifs/reference").send(validBody);
      expect(res.status).toBe(401);
    });

    it("returns 400 for an invalid body", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);
      const res = await agent.post("/api/v1/gifs/reference").send({ giphyId: "abc123" });
      expect(res.status).toBe(400);
    });

    it("returns 403 for a banned user", async () => {
      const user = await createUser({ username: "banned1", email: "banned1@test.local" });
      const agent = await authenticatedAgent(user);
      await getTestPrisma().user.update({ where: { id: user.id }, data: { is_banned: 1 } });
      const res = await agent.post("/api/v1/gifs/reference").send(validBody);
      expect(res.status).toBe(403);
    });

    it("creates a giphy Media record and returns mediaId", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);
      const res = await agent.post("/api/v1/gifs/reference").send(validBody);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.mediaId).toBeTruthy();

      const media = await getTestPrisma().media.findUnique({ where: { id: res.body.mediaId } });
      expect(media.media_type).toBe("giphy");
      expect(media.media_url).toBe("abc123");
      expect(JSON.parse(media.media_meta)).toMatchObject({ url: validBody.giphyUrl, still: validBody.giphyStill, width: 200, height: 150 });
    });
  });

  // ── Favorites CRUD ───────────────────────────────────────────────────────

  describe("Favorites", () => {
    it("returns 401 for all favorites endpoints when unauthenticated", async () => {
      const req = await request();
      expect((await req.get("/api/v1/gifs/favorites")).status).toBe(401);
      expect((await req.post("/api/v1/gifs/favorites").send({ giphyId: "x", giphyUrl: "https://media.giphy.com/media/x/giphy.gif", giphyStill: "https://media.giphy.com/media/x/giphy_s.gif", width: 200, height: 150 })).status).toBe(401);
      expect((await req.delete("/api/v1/gifs/favorites/x")).status).toBe(401);
    });

    it("adds a favorite idempotently and lists it", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);
      const body = { giphyId: "fav1", giphyUrl: "https://media.giphy.com/media/fav1/giphy.gif", giphyStill: "https://media.giphy.com/media/fav1/giphy_s.gif", width: 200, height: 150 };

      const add1 = await agent.post("/api/v1/gifs/favorites").send(body);
      expect(add1.status).toBe(200);
      const add2 = await agent.post("/api/v1/gifs/favorites").send(body);
      expect(add2.status).toBe(200);

      const count = await getTestPrisma().gifFavorite.count({ where: { user_id: user.id } });
      expect(count).toBe(1);

      const list = await agent.get("/api/v1/gifs/favorites");
      expect(list.body.favorites).toHaveLength(1);
      expect(list.body.favorites[0]).toMatchObject({ giphyId: "fav1", giphyUrl: body.giphyUrl });
    });

    it("returns 404 when removing a favorite that doesn't exist", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);
      const res = await agent.delete("/api/v1/gifs/favorites/nope");
      expect(res.status).toBe(404);
    });

    it("removes an existing favorite", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);
      await agent.post("/api/v1/gifs/favorites").send({ giphyId: "fav2", giphyUrl: "https://media.giphy.com/media/fav2/giphy.gif", giphyStill: "https://media.giphy.com/media/fav2/giphy_s.gif", width: 200, height: 150 });

      const del = await agent.delete("/api/v1/gifs/favorites/fav2");
      expect(del.status).toBe(200);

      const count = await getTestPrisma().gifFavorite.count({ where: { user_id: user.id } });
      expect(count).toBe(0);
    });

    it("enforces the 500-favorite cap", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);

      await getTestPrisma().gifFavorite.createMany({
        data: Array.from({ length: 500 }, (_, i) => ({
          user_id: user.id, giphy_id: `bulk-${i}`, giphy_url: `https://media.giphy.com/media/bulk-${i}/giphy.gif`,
        })),
      });

      const res = await agent.post("/api/v1/gifs/favorites").send({ giphyId: "one-too-many", giphyUrl: "https://media.giphy.com/media/one-too-many/giphy.gif", giphyStill: "https://media.giphy.com/media/one-too-many/giphy_s.gif", width: 200, height: 150 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/500/);
    });
  });

  // ── Personal GIF upload / library ───────────────────────────────────────

  describe("Personal GIF library", () => {
    it("returns 401 for /my and /upload when unauthenticated", async () => {
      const req = await request();
      expect((await req.get("/api/v1/gifs/my")).status).toBe(401);
      expect((await req.post("/api/v1/gifs/upload")).status).toBe(401);
    });

    it("uploads a GIF, lists it, and soft-deletes it", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);
      const buf = await makeGif();

      const up = await agent.post("/api/v1/gifs/upload").attach("file", buf, { filename: "t.gif", contentType: "image/gif" });
      expect(up.status).toBe(200);
      expect(up.body.ok).toBe(true);
      expect(up.body.mediaId).toBeTruthy();

      const media = await getTestPrisma().media.findUnique({ where: { id: up.body.mediaId } });
      expect(media.media_type).toBe("image");

      const list = await agent.get("/api/v1/gifs/my");
      expect(list.body.gifs).toHaveLength(1);
      expect(list.body.gifs[0].mediaId).toBe(up.body.mediaId);

      const del = await agent.delete(`/api/v1/gifs/my/${up.body.id}`);
      expect(del.status).toBe(200);

      const list2 = await agent.get("/api/v1/gifs/my");
      expect(list2.body.gifs).toHaveLength(0);

      // Underlying Media record survives the soft-delete
      const mediaAfter = await getTestPrisma().media.findUnique({ where: { id: up.body.mediaId } });
      expect(mediaAfter).not.toBeNull();
    });

    it("rejects a non-GIF file", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);
      const res = await agent.post("/api/v1/gifs/upload").attach("file", Buffer.from("not a gif"), { filename: "t.jpg", contentType: "image/jpeg" });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/GIF/);
    });

    it("rejects a file exceeding the size limit", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);
      const big = Buffer.alloc(10 * 1024 * 1024 + 1);
      const res = await agent.post("/api/v1/gifs/upload").attach("file", big, { filename: "big.gif", contentType: "image/gif" });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/большой/);
    });

    it("enforces the 30-personal-GIF cap", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);
      const prisma = getTestPrisma();

      await prisma.media.createMany({
        data: Array.from({ length: 30 }, () => ({
          id: crypto.randomUUID(), user_id: user.id, media_type: "image", media_url: crypto.randomUUID(), media_meta: "{}",
        })),
      });
      const mediaRows = await prisma.media.findMany({ where: { user_id: user.id } });
      await prisma.userGif.createMany({
        data: mediaRows.map((m) => ({ user_id: user.id, media_id: m.id })),
      });

      const buf = await makeGif();
      const res = await agent.post("/api/v1/gifs/upload").attach("file", buf, { filename: "t.gif", contentType: "image/gif" });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/30/);
    });

    it("returns 403 when deleting another user's personal GIF", async () => {
      const owner = await createUser({ username: "owner1", email: "owner1@test.local" });
      const other = await createUser({ username: "other1", email: "other1@test.local" });
      const ownerAgent = await authenticatedAgent(owner);
      const otherAgent = await authenticatedAgent(other);
      const buf = await makeGif();

      const up = await ownerAgent.post("/api/v1/gifs/upload").attach("file", buf, { filename: "t.gif", contentType: "image/gif" });
      expect(up.status).toBe(200);

      const del = await otherAgent.delete(`/api/v1/gifs/my/${up.body.id}`);
      expect(del.status).toBe(403);
    });

    it("returns 404 when deleting a non-existent personal GIF", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = await authenticatedAgent(user);
      const res = await agent.delete("/api/v1/gifs/my/00000000-0000-0000-0000-000000000000");
      expect(res.status).toBe(404);
    });
  });
});
