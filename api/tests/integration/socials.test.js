import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { cleanDb, disconnectDb, authenticatedAgent, request } from "../helpers.js";
import { createUser, createSocial } from "../fixtures/index.js";

describe("Socials", () => {
  beforeEach(async () => {
    await cleanDb();
    vi.clearAllMocks();
  });
  afterAll(async () => {
    await cleanDb();
    await disconnectDb();
  });

  describe("GET /users/:id/socials", () => {
    it("returns empty list for user with no socials", async () => {
      const user = await createUser();
      const res = await (await request()).get(`/api/v1/users/${user.id}/socials`);
      expect(res.status).toBe(200);
      expect(res.body.socials).toEqual([]);
    });

    it("returns user socials with display field", async () => {
      const user = await createUser();
      await createSocial({ userId: user.id, type: "steam", url: "https://steamcommunity.com/id/FlameInTheDark", display: "FlameInTheDark" });
      await createSocial({ userId: user.id, type: "telegram", url: "https://t.me/testuser", display: "@testuser" });

      const res = await (await request()).get(`/api/v1/users/${user.id}/socials`);
      expect(res.status).toBe(200);
      expect(res.body.socials).toHaveLength(2);
      expect(res.body.socials[0]).toMatchObject({
        type: "steam",
        url: "https://steamcommunity.com/id/FlameInTheDark",
        display: "FlameInTheDark",
      });
      expect(res.body.socials[1]).toMatchObject({
        type: "telegram",
        display: "@testuser",
      });
    });
  });

  describe("POST /users/:id/socials", () => {
    it("adds a social", async () => {
      const user = await createUser();
      const agent = await authenticatedAgent(user);

      const res = await agent
        .post(`/api/v1/users/${user.id}/socials`)
        .send({ type: "steam", url: "https://steamcommunity.com/id/TestUser" });

      expect(res.status).toBe(201);
      expect(res.body.social).toMatchObject({
        type: "steam",
        url: "https://steamcommunity.com/id/TestUser",
        display: "TestUser",
      });
    });

    it("normalizes URLs", async () => {
      const user = await createUser();
      const agent = await authenticatedAgent(user);

      const res = await agent
        .post(`/api/v1/users/${user.id}/socials`)
        .send({ type: "steam", url: "https://steamcommunity.com/id/TestUser/" });

      expect(res.status).toBe(201);
      expect(res.body.social.url).toBe("https://steamcommunity.com/id/TestUser");
    });

    it("normalizes twitter.com to x.com", async () => {
      const user = await createUser();
      const agent = await authenticatedAgent(user);

      const res = await agent
        .post(`/api/v1/users/${user.id}/socials`)
        .send({ type: "x", url: "https://twitter.com/testhandle" });

      expect(res.status).toBe(201);
      expect(res.body.social.url).toBe("https://x.com/testhandle");
    });

    it("returns 401 when not authenticated", async () => {
      const user = await createUser();
      const res = await (await request())
        .post(`/api/v1/users/${user.id}/socials`)
        .send({ type: "steam", url: "https://steamcommunity.com/id/Test" });
      expect(res.status).toBe(401);
    });

    it("returns 403 when modifying another user", async () => {
      const user = await createUser();
      const other = await createUser();
      const agent = await authenticatedAgent(user);

      const res = await agent
        .post(`/api/v1/users/${other.id}/socials`)
        .send({ type: "steam", url: "https://steamcommunity.com/id/Test" });
      expect(res.status).toBe(403);
    });

    it("rejects invalid platform type", async () => {
      const user = await createUser();
      const agent = await authenticatedAgent(user);

      const res = await agent
        .post(`/api/v1/users/${user.id}/socials`)
        .send({ type: "tiktok", url: "https://tiktok.com/@user" });
      expect(res.status).toBe(400);
    });

    it("rejects URL for wrong platform", async () => {
      const user = await createUser();
      const agent = await authenticatedAgent(user);

      const res = await agent
        .post(`/api/v1/users/${user.id}/socials`)
        .send({ type: "steam", url: "https://t.me/testuser" });
      expect(res.status).toBe(400);
    });

    it("rejects duplicate social type", async () => {
      const user = await createUser();
      const agent = await authenticatedAgent(user);

      await agent
        .post(`/api/v1/users/${user.id}/socials`)
        .send({ type: "steam", url: "https://steamcommunity.com/id/Test1" })
        .expect(201);

      const res = await agent
        .post(`/api/v1/users/${user.id}/socials`)
        .send({ type: "steam", url: "https://steamcommunity.com/id/Test2" });
      expect(res.status).toBe(409);
    });
  });

  describe("PUT /users/:id/socials/:type", () => {
    it("updates a social URL", async () => {
      const user = await createUser();
      await createSocial({ userId: user.id, type: "steam", url: "https://steamcommunity.com/id/OldName", display: "OldName" });
      const agent = await authenticatedAgent(user);

      const res = await agent
        .put(`/api/v1/users/${user.id}/socials/steam`)
        .send({ url: "https://steamcommunity.com/id/NewName" });

      expect(res.status).toBe(200);
      expect(res.body.social).toMatchObject({
        type: "steam",
        url: "https://steamcommunity.com/id/NewName",
        display: "NewName",
      });
    });

    it("returns 404 if social does not exist", async () => {
      const user = await createUser();
      const agent = await authenticatedAgent(user);

      const res = await agent
        .put(`/api/v1/users/${user.id}/socials/steam`)
        .send({ url: "https://steamcommunity.com/id/Test" });
      expect(res.status).toBe(404);
    });

    it("returns 403 when modifying another user", async () => {
      const user = await createUser();
      const other = await createUser();
      await createSocial({ userId: other.id, type: "steam", url: "https://steamcommunity.com/id/Test" });
      const agent = await authenticatedAgent(user);

      const res = await agent
        .put(`/api/v1/users/${other.id}/socials/steam`)
        .send({ url: "https://steamcommunity.com/id/Hacked" });
      expect(res.status).toBe(403);
    });

    it("rejects invalid URL for platform", async () => {
      const user = await createUser();
      await createSocial({ userId: user.id, type: "steam", url: "https://steamcommunity.com/id/Test" });
      const agent = await authenticatedAgent(user);

      const res = await agent
        .put(`/api/v1/users/${user.id}/socials/steam`)
        .send({ url: "https://t.me/wrongplatform" });
      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /users/:id/socials/:type", () => {
    it("deletes a social", async () => {
      const user = await createUser();
      await createSocial({ userId: user.id, type: "steam", url: "https://steamcommunity.com/id/Test" });
      const agent = await authenticatedAgent(user);

      const res = await agent.delete(`/api/v1/users/${user.id}/socials/steam`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });

      // Verify it's gone
      const listRes = await (await request()).get(`/api/v1/users/${user.id}/socials`);
      expect(listRes.body.socials).toHaveLength(0);
    });

    it("returns 404 if social does not exist", async () => {
      const user = await createUser();
      const agent = await authenticatedAgent(user);

      const res = await agent.delete(`/api/v1/users/${user.id}/socials/steam`);
      expect(res.status).toBe(404);
    });

    it("returns 403 when deleting another user's social", async () => {
      const user = await createUser();
      const other = await createUser();
      await createSocial({ userId: other.id, type: "steam", url: "https://steamcommunity.com/id/Test" });
      const agent = await authenticatedAgent(user);

      const res = await agent.delete(`/api/v1/users/${other.id}/socials/steam`);
      expect(res.status).toBe(403);
    });
  });
});
