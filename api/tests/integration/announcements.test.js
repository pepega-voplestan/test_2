import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { request, cleanDb, disconnectDb } from "../helpers.js";
import { createAnnouncement } from "../fixtures/index.js";

// Must be set before the app module is lazy-loaded on the first request() call.
// common.js reads ANNOUNCEMENTS_SECRET at module-load time.
process.env.ANNOUNCEMENTS_SECRET = "test-ann-secret";
const SECRET = "test-ann-secret";

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
    it("returns null when no announcements exist", async () => {
      const res = await (await request()).get("/api/v1/announcements");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ announcement: null });
    });

    it("returns the active announcement with id, content, createdAt", async () => {
      await createAnnouncement({ content: "Hello from test" });
      const res = await (await request()).get("/api/v1/announcements");
      expect(res.status).toBe(200);
      expect(res.body.announcement).toMatchObject({ content: "Hello from test" });
      expect(typeof res.body.announcement.id).toBe("string");
      expect(typeof res.body.announcement.createdAt).toBe("string");
    });

    it("returns null when the only announcement is soft-deleted", async () => {
      await createAnnouncement({ content: "Deleted", is_deleted: 1 });
      const res = await (await request()).get("/api/v1/announcements");
      expect(res.status).toBe(200);
      expect(res.body.announcement).toBeNull();
    });

    it("returns the most recently created announcement when multiple exist", async () => {
      const earlier = new Date(Date.now() - 60_000)
        .toISOString()
        .replace("T", " ")
        .replace(/\.\d{3}Z$/, "");
      await createAnnouncement({ content: "Old announcement", created_at: earlier });
      await createAnnouncement({ content: "New announcement" });

      const res = await (await request()).get("/api/v1/announcements");
      expect(res.status).toBe(200);
      expect(res.body.announcement.content).toBe("New announcement");
    });
  });

  // ── POST /api/v1/announcements ────────────────────────────────────────────

  describe("POST /api/v1/announcements", () => {
    it("returns 400 when content is missing", async () => {
      const res = await (await request())
        .post("/api/v1/announcements")
        .send({ secret_key: SECRET });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it("returns 400 when secret_key is missing", async () => {
      const res = await (await request())
        .post("/api/v1/announcements")
        .send({ content: "Hello" });
      // announcementSchema requires secret_key min(1), so zod rejects it first
      expect(res.status).toBe(400);
    });

    it("returns 403 when secret_key is wrong", async () => {
      const res = await (await request())
        .post("/api/v1/announcements")
        .send({ content: "Hello", secret_key: "wrong-key" });
      expect(res.status).toBe(403);
      expect(res.body.error).toBeDefined();
    });

    it("creates a new announcement and returns { ok, id }", async () => {
      const res = await (await request())
        .post("/api/v1/announcements")
        .send({ content: "New announcement", secret_key: SECRET });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(typeof res.body.id).toBe("string");
    });

    it("new announcement is visible via GET after POST", async () => {
      await (await request())
        .post("/api/v1/announcements")
        .send({ content: "Posted announcement", secret_key: SECRET });

      const res = await (await request()).get("/api/v1/announcements");
      expect(res.body.announcement.content).toBe("Posted announcement");
    });

    it("soft-deletes previous active announcements when a new one is posted", async () => {
      // Post first
      await (await request())
        .post("/api/v1/announcements")
        .send({ content: "First", secret_key: SECRET });

      // Post second
      await (await request())
        .post("/api/v1/announcements")
        .send({ content: "Second", secret_key: SECRET });

      // Only the second should be returned
      const res = await (await request()).get("/api/v1/announcements");
      expect(res.status).toBe(200);
      expect(res.body.announcement.content).toBe("Second");
    });
  });
});
