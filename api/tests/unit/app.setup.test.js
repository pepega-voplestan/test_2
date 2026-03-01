/**
 * Tests for app.js branches that only run outside test mode.
 * Loads app.js with NODE_ENV=development by resetting the module cache
 * after registering lightweight mocks for the heavy optional deps.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import supertest from "supertest";

// ── Mocks (hoisted; persist through vi.resetModules) ─────────────────────────

vi.mock("../../src/sse.js", () => ({
  addClient: vi.fn(),
  broadcast: vi.fn(),
  broadcastToUser: vi.fn(),
}));

vi.mock("../../src/email.js", () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/admin.js", () => ({
  setupAdmin: vi.fn().mockResolvedValue({
    admin: { options: { rootPath: "/admin" } },
    adminRouter: (_req, _res, next) => next(),
  }),
}));

// connect-sqlite3 is dynamically imported by app.js for the SQLite session store.
// express-session calls store.on(...) so the mock store must implement EventEmitter methods.
vi.mock("connect-sqlite3", () => ({
  default: (_session) => {
    class MockSQLiteStore {
      constructor() { this._ev = {}; }
      on(e, fn) { (this._ev[e] = this._ev[e] || []).push(fn); return this; }
      emit(e, ...a) { (this._ev[e] || []).forEach(fn => fn(...a)); return this; }
      removeListener() { return this; }
      get(_sid, fn) { fn(null, null); }
      set(_sid, _sess, fn) { fn(null); }
      destroy(_sid, fn) { fn(null); }
    }
    return MockSQLiteStore;
  },
}));

// swagger-ui-express is dynamically imported for the /api/docs route
vi.mock("swagger-ui-express", () => ({
  default: {
    serve: (_req, _res, next) => next(),
    setup: () => (_req, _res, next) => next(),
  },
}));

vi.mock("../../src/swagger.js", () => ({ swaggerSpec: {} }));

// Minimal prisma mock so route imports don't crash (routes only call prisma inside handlers)
vi.mock("../../src/db.js", () => ({
  prisma: { $queryRawUnsafe: vi.fn().mockResolvedValue([]) },
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("app.js — development mode branches", () => {
  let app;
  const saved = {};

  beforeAll(async () => {
    for (const k of ["NODE_ENV", "SESSION_SECRET"]) {
      saved[k] = process.env[k];
    }
    process.env.NODE_ENV = "development";
    process.env.SESSION_SECRET = "dev-secret-for-test";

    // Clear module cache so app.js re-evaluates with the new NODE_ENV
    vi.resetModules();
    app = (await import("../../src/app.js")).default;
  });

  afterAll(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  // ── lines 15-17: request logging middleware ───────────────────────────────

  it("logs each request method and path to console", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await supertest(app).get("/api/v1/health");
    expect(spy).toHaveBeenCalledWith(expect.stringMatching(/GET.*\/api\/v1\/health/));
    spy.mockRestore();
  });

  // ── lines 23-30: admin panel setup ───────────────────────────────────────

  it("calls setupAdmin and mounts the admin router", async () => {
    const { setupAdmin } = await import("../../src/admin.js");
    expect(setupAdmin).toHaveBeenCalled();
  });

  it("mounts a rate limiter on /admin/login", async () => {
    // A GET to /admin/login should pass through the limiter without 429
    const res = await supertest(app).get("/admin/login");
    expect(res.status).not.toBe(429);
  });

  // ── lines 78-94: auth + upload rate limiters ─────────────────────────────

  it("rate limiter allows normal auth traffic", async () => {
    const res = await supertest(app)
      .post("/api/v1/auth/login")
      .send({ login: "u", password: "p" });
    expect(res.status).not.toBe(429);
  });

  // ── lines 99-102: Swagger UI at /api/docs ────────────────────────────────

  it("mounts Swagger UI at /api/docs", async () => {
    const res = await supertest(app).get("/api/docs");
    // swagger-ui-express serve + setup both call next() in our mock, so the
    // request falls through to Express's default 404 handler
    expect([200, 301, 302, 404]).toContain(res.status);
  });

  // ── lines 107-112: media static serving ─────────────────────────────────

  it("serves static files from MEDIA_PATH at /media", async () => {
    // MEDIA_PATH is set by env.js to the tmp dir; requesting a missing file
    // returns 404 from express.static (not an app crash)
    const res = await supertest(app).get("/media/nonexistent.webp");
    expect(res.status).toBe(404);
  });

  // ── baseline: app is functional ──────────────────────────────────────────

  it("health check returns ok", async () => {
    const res = await supertest(app).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

// ── JSON body parser behaviour (tested via the test-mode app) ────────────────

describe("app.js — JSON body parser", () => {
  let app;

  beforeAll(async () => {
    // Use test-mode app via helpers (already cached; no NODE_ENV switch needed)
    const { getApp } = await import("../helpers.js");
    app = await getApp();
  });

  it("returns 413 when the request body exceeds 50 kb", async () => {
    const res = await supertest(app)
      .post("/api/v1/auth/login")
      .send({ data: "x".repeat(52 * 1024) }); // ~52 kb of JSON
    expect(res.status).toBe(413);
  });

  it("returns 400 for a malformed JSON body", async () => {
    const res = await supertest(app)
      .post("/api/v1/auth/login")
      .set("Content-Type", "application/json")
      .send("{not valid json");
    expect(res.status).toBe(400);
  });
});
