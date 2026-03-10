import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { cleanDb, disconnectDb, authenticatedAgent, request } from "../helpers.js";
import { createUser, createIgnoredUser } from "../fixtures/index.js";

describe("Ignored Users", () => {
  beforeEach(async () => {
    await cleanDb();
    vi.clearAllMocks();
  });
  afterAll(async () => {
    await cleanDb();
    await disconnectDb();
  });

  describe("POST /users/:id/ignore", () => {
    it("creates an ignore relationship", async () => {
      const owner = await createUser();
      const target = await createUser();
      const agent = await authenticatedAgent(owner);

      const res = await agent.post(`/api/v1/users/${target.id}/ignore`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    it("returns 401 when not authenticated", async () => {
      const target = await createUser();
      const res = await (await request()).post(`/api/v1/users/${target.id}/ignore`);
      expect(res.status).toBe(401);
    });

    it("cannot ignore self", async () => {
      const owner = await createUser();
      const agent = await authenticatedAgent(owner);

      const res = await agent.post(`/api/v1/users/${owner.id}/ignore`);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/самого себя/);
    });

    it("returns success if already ignored (idempotent)", async () => {
      const owner = await createUser();
      const target = await createUser();
      const agent = await authenticatedAgent(owner);

      await agent.post(`/api/v1/users/${target.id}/ignore`).expect(200);
      const res = await agent.post(`/api/v1/users/${target.id}/ignore`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    it("returns 404 for non-existent target", async () => {
      const owner = await createUser();
      const agent = await authenticatedAgent(owner);

      const res = await agent.post("/api/v1/users/non-existent-id/ignore");
      expect(res.status).toBe(404);
    });

    it("enforces ignore limit", async () => {
      const owner = await createUser();
      const targets = await Promise.all([createUser(), createUser(), createUser(), createUser()]);
      const agent = await authenticatedAgent(owner);

      // Ignore 3 users (the limit)
      for (let i = 0; i < 3; i++) {
        await agent.post(`/api/v1/users/${targets[i].id}/ignore`).expect(200);
      }

      // 4th should fail
      const res = await agent.post(`/api/v1/users/${targets[3].id}/ignore`);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/заполнен/);
    });
  });

  describe("DELETE /users/:id/ignore", () => {
    it("removes an ignore relationship", async () => {
      const owner = await createUser();
      const target = await createUser();
      await createIgnoredUser({ ownerUserId: owner.id, targetUserId: target.id });
      const agent = await authenticatedAgent(owner);

      const res = await agent.delete(`/api/v1/users/${target.id}/ignore`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });

      // Verify it's actually removed
      const listRes = await agent.get("/api/v1/me/ignored-users");
      expect(listRes.body.userIds).toEqual([]);
    });

    it("returns success even if not ignoring the target", async () => {
      const owner = await createUser();
      const target = await createUser();
      const agent = await authenticatedAgent(owner);

      const res = await agent.delete(`/api/v1/users/${target.id}/ignore`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    it("returns 401 when not authenticated", async () => {
      const target = await createUser();
      const res = await (await request()).delete(`/api/v1/users/${target.id}/ignore`);
      expect(res.status).toBe(401);
    });
  });

  describe("GET /me/ignored-users", () => {
    it("returns empty list when no users are ignored", async () => {
      const owner = await createUser();
      const agent = await authenticatedAgent(owner);

      const res = await agent.get("/api/v1/me/ignored-users");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ userIds: [] });
    });

    it("returns correct list of ignored user IDs", async () => {
      const owner = await createUser();
      const t1 = await createUser();
      const t2 = await createUser();
      await createIgnoredUser({ ownerUserId: owner.id, targetUserId: t1.id });
      await createIgnoredUser({ ownerUserId: owner.id, targetUserId: t2.id });
      const agent = await authenticatedAgent(owner);

      const res = await agent.get("/api/v1/me/ignored-users");
      expect(res.status).toBe(200);
      expect(res.body.userIds).toHaveLength(2);
      expect(res.body.userIds).toContain(t1.id);
      expect(res.body.userIds).toContain(t2.id);
    });

    it("does not return other users' ignores", async () => {
      const owner = await createUser();
      const otherUser = await createUser();
      const target = await createUser();
      await createIgnoredUser({ ownerUserId: otherUser.id, targetUserId: target.id });
      const agent = await authenticatedAgent(owner);

      const res = await agent.get("/api/v1/me/ignored-users");
      expect(res.body.userIds).toEqual([]);
    });

    it("returns 401 when not authenticated", async () => {
      const res = await (await request()).get("/api/v1/me/ignored-users");
      expect(res.status).toBe(401);
    });
  });
});
