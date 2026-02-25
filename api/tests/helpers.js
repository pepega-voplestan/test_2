/**
 * Shared test utilities for integration tests.
 */
import { vi } from "vitest";
import supertest from "supertest";
import { PrismaClient } from "@prisma/client";

// Mock email module before any app imports
vi.mock("../src/email.js", () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
}));

// Mock SSE module to avoid heartbeat intervals leaking into tests
vi.mock("../src/sse.js", () => ({
  addClient: vi.fn(),
  broadcast: vi.fn(),
  broadcastToUser: vi.fn(),
}));

// Mock admin module to avoid AdminJS dependency in tests
vi.mock("../src/admin.js", () => ({
  setupAdmin: vi.fn(),
}));

/** Prisma client pointed at the test database */
let _prisma;
export function getTestPrisma() {
  if (!_prisma) {
    _prisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL } },
      log: ["warn", "error"],
    });
  }
  return _prisma;
}

/** Import the Express app (lazy, after mocks are set up) */
let _app;
export async function getApp() {
  if (!_app) {
    const mod = await import("../src/app.js");
    _app = mod.default;
  }
  return _app;
}

/** Get a supertest agent bound to the app */
export async function request() {
  const app = await getApp();
  return supertest(app);
}

/**
 * Get an authenticated supertest agent (cookie-persisting).
 * Creates a session by directly setting req.session in a test-only manner.
 * @param {object} user - { id, name, avatar }
 */
export async function authenticatedAgent(user) {
  const app = await getApp();
  const agent = supertest.agent(app);

  // Login by hitting a test helper endpoint or by using the auth flow
  // For simplicity, we set the session via the login endpoint
  // But since we may not have the password, we'll use a direct session trick:
  // POST to login with known credentials (tests should create users with known passwords via fixtures)
  const { createUser } = await import("./fixtures/index.js");

  // If user has a _rawPassword (from fixtures), use it to login
  if (user._rawPassword) {
    await agent
      .post("/api/v1/auth/login")
      .send({ login: user.username, password: user._rawPassword })
      .expect(200);
  }

  return agent;
}

/** Table names in dependency-safe deletion order */
const TABLES = [
  "notification",
  "commentLike",
  "shoutLike",
  "comment",
  "media",
  "shout",
  "verificationCode",
  "announcement",
  "setting",
  "user",
];

/** Truncate all tables — call between test suites */
export async function cleanDb() {
  const prisma = getTestPrisma();
  for (const table of TABLES) {
    await prisma[table].deleteMany();
  }
}

/** Disconnect Prisma (call in afterAll) */
export async function disconnectDb() {
  if (_prisma) {
    await _prisma.$disconnect();
    _prisma = null;
  }
}
