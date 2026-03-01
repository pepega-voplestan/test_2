import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import supertest from "supertest";
import { request, getApp, cleanDb, disconnectDb } from "../helpers.js";
import { createUser } from "../fixtures/index.js";

describe("Index routes", () => {
  beforeEach(async () => {
    await cleanDb();
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await cleanDb();
    await disconnectDb();
  });

  // ── GET /api/v1/me ────────────────────────────────────────────────────────

  describe("GET /api/v1/me", () => {
    it("returns { user: null } when not authenticated", async () => {
      const res = await (await request()).get("/api/v1/me");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ user: null });
    });

    it("returns the session user when authenticated", async () => {
      const user = await createUser({ username: "alice", email: "alice@test.local" });
      const agent = supertest.agent(await getApp());

      await agent
        .post("/api/v1/auth/login")
        .send({ login: "alice", password: user._rawPassword })
        .expect(200);

      const res = await agent.get("/api/v1/me");
      expect(res.status).toBe(200);
      expect(res.body.user).toMatchObject({ id: user.id, name: "alice" });
    });
  });
});
