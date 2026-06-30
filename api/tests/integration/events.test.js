import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { request, authenticatedAgent, cleanDb, disconnectDb, getTestPrisma } from "../helpers.js";
import { createUser } from "../fixtures/index.js";

/**
 * GET /api/v1/events authorization gate.
 *
 * Note: sse.js is mocked in helpers.js (addClient is a no-op spy), so the
 * AUTHORIZED path does not open a real stream — its behavior (200 + stream,
 * broadcast delivery, no null-userId client, server-side reaping) is covered by
 * the sse.js unit tests. Here we assert the REFUSAL path: the route must return
 * 401 BEFORE any stream is established for anonymous, banned, or deleted
 * sessions (FR-002, FR-003, SC-001, SC-004).
 */
describe("GET /api/v1/events — realtime authorization gate", () => {
  beforeEach(async () => {
    await cleanDb();
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await cleanDb();
    await disconnectDb();
  });

  it("returns 401 JSON (no stream) for an anonymous request", async () => {
    const res = await (await request()).get("/api/v1/events");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Unauthorized" });
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.headers["content-type"]).not.toMatch(/text\/event-stream/);
  });

  it("returns 401 for a session whose account was banned after login", async () => {
    const user = await createUser({ username: "banme", email: "banme@test.local" });
    const agent = await authenticatedAgent(user);

    // Ban after the session is established — getRealtimeUserId re-checks via Prisma.
    await getTestPrisma().user.update({ where: { id: user.id }, data: { is_banned: 1 } });

    const res = await agent.get("/api/v1/events");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Unauthorized" });
  });

  it("returns 401 for a session whose account no longer exists", async () => {
    const user = await createUser({ username: "deleteme", email: "deleteme@test.local" });
    const agent = await authenticatedAgent(user);

    await getTestPrisma().user.delete({ where: { id: user.id } });

    const res = await agent.get("/api/v1/events");
    expect(res.status).toBe(401);
  });
});
