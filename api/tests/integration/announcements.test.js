import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { request, cleanDb, disconnectDb } from "../helpers.js";
import { createAnnouncement } from "../fixtures/index.js";

// Must be set before the app module is lazy-loaded on the first request() call.
process.env.ANNOUNCEMENTS_SECRET = "test-ann-secret";
const SECRET = "test-ann-secret";

const VALID_POST = {
  title: "v1.0",
  release_date: "2026-05-24",
  content: "New announcement",
  secret_key: SECRET,
};

describe("Announcements routes", () => {
  beforeEach(async () => {
    await cleanDb();
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await cleanDb();
    await disconnectDb();
  });

  // ── GET /api/v1/announcements ─────────────────────────────────────────────

  describe("GET /api/v1/announcements", () => {
    it("returns empty items array when no announcements exist", async () => {
      const res = await (await request()).get("/api/v1/announcements");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ items: [] });
    });

    it("returns active announcements with id, title, releaseDate, content, createdAt", async () => {
      await createAnnouncement({ title: "Hello", release_date: "2026-05-24", content: "Hello from test" });
      const res = await (await request()).get("/api/v1/announcements");
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      const item = res.body.items[0];
      expect(item).toMatchObject({ title: "Hello", content: "Hello from test", releaseDate: "2026-05-24" });
      expect(typeof item.id).toBe("string");
      expect(typeof item.createdAt).toBe("string");
    });

    it("excludes soft-deleted announcements", async () => {
      await createAnnouncement({ content: "Deleted", is_deleted: 1 });
      const res = await (await request()).get("/api/v1/announcements");
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(0);
    });

    it("returns all active announcements sorted by release_date desc", async () => {
      await createAnnouncement({ title: "Old", release_date: "2026-01-01", content: "Old" });
      await createAnnouncement({ title: "New", release_date: "2026-05-24", content: "New" });

      const res = await (await request()).get("/api/v1/announcements");
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.items[0].title).toBe("New");
      expect(res.body.items[1].title).toBe("Old");
    });
  });

  // ── POST /api/v1/announcements ────────────────────────────────────────────

  describe("POST /api/v1/announcements", () => {
    it("returns 400 when content is missing", async () => {
      const res = await (await request())
        .post("/api/v1/announcements")
        .send({ title: "T", release_date: "2026-05-24", secret_key: SECRET });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it("returns 400 when secret_key is missing", async () => {
      const res = await (await request())
        .post("/api/v1/announcements")
        .send({ title: "T", release_date: "2026-05-24", content: "Hello" });
      expect(res.status).toBe(400);
    });

    it("returns 403 when secret_key is wrong", async () => {
      const res = await (await request())
        .post("/api/v1/announcements")
        .send({ title: "T", release_date: "2026-05-24", content: "Hello", secret_key: "wrong-key" });
      expect(res.status).toBe(403);
      expect(res.body.error).toBeDefined();
    });

    it("creates a new announcement and returns { ok, id }", async () => {
      const res = await (await request())
        .post("/api/v1/announcements")
        .send(VALID_POST);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(typeof res.body.id).toBe("string");
    });

    it("new announcement is visible via GET after POST", async () => {
      await (await request())
        .post("/api/v1/announcements")
        .send({ ...VALID_POST, content: "Posted announcement" });

      const res = await (await request()).get("/api/v1/announcements");
      expect(res.body.items[0].content).toBe("Posted announcement");
    });

    it("multiple announcements accumulate; all are visible via GET", async () => {
      await (await request())
        .post("/api/v1/announcements")
        .send({ ...VALID_POST, title: "First", release_date: "2026-01-01", content: "First" });

      await (await request())
        .post("/api/v1/announcements")
        .send({ ...VALID_POST, title: "Second", release_date: "2026-05-24", content: "Second" });

      const res = await (await request()).get("/api/v1/announcements");
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(2);
      // Sorted by release_date desc: Second first
      expect(res.body.items[0].content).toBe("Second");
    });
  });
});
