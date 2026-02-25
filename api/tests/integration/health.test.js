import { describe, it, expect, afterAll } from "vitest";
import { request, cleanDb, disconnectDb } from "../helpers.js";

describe("GET /api/v1/health", () => {
  afterAll(async () => {
    await cleanDb();
    await disconnectDb();
  });

  it("should return { ok: true }", async () => {
    const res = await (await request()).get("/api/v1/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("should respond with JSON content-type", async () => {
    const res = await (await request()).get("/api/v1/health");

    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });
});
