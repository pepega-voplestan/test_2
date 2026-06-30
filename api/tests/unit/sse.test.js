import { describe, it, expect, vi, beforeEach } from "vitest";
import EventEmitter from "events";

// Mock the Prisma client used by reapInvalidClients' account-active check.
const findUnique = vi.hoisted(() => vi.fn());
vi.mock("../../src/db.js", () => ({ prisma: { user: { findUnique } } }));

import { addClient, broadcast, broadcastToUser, reapInvalidClients } from "../../src/sse.js";

/** A session store stub whose get() resolves to a controllable session. */
function makeStore(session = { user: { id: "u" } }) {
  return { get: vi.fn((_sid, cb) => cb(null, session)) };
}

/** Create a mock request for an authenticated client. */
function makeReq(userId = "user-1", { sid = `sid-${userId}`, store } = {}) {
  const emitter = new EventEmitter();
  emitter.session = userId ? { user: { id: userId } } : null;
  emitter.sessionID = sid;
  emitter.sessionStore = store ?? makeStore({ user: { id: userId } });
  return emitter;
}

/** Create a mock response with write/writeHead/end spies. */
function makeRes() {
  return { writeHead: vi.fn(), write: vi.fn(), end: vi.fn() };
}

/**
 * Add a client and return a cleanup function that simulates disconnect.
 * Always call cleanup() after the test so the module's client map stays clean.
 */
function connect(userId = "user-1", opts = {}) {
  const req = makeReq(userId, opts);
  const res = makeRes();
  addClient(req, res);
  const cleanup = () => req.emit("close");
  return { req, res, cleanup };
}

beforeEach(() => {
  vi.clearAllMocks();
  findUnique.mockResolvedValue({ is_banned: 0 }); // active account by default
});

// ── addClient ─────────────────────────────────────────────────────────────────

describe("addClient", () => {
  it("writes SSE headers with content-type text/event-stream for an authed user", () => {
    const { res, cleanup } = connect("user-1");
    expect(res.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ "Content-Type": "text/event-stream" })
    );
    cleanup();
  });

  it("sends the :ok handshake on connect", () => {
    const { res, cleanup } = connect("user-1");
    expect(res.write).toHaveBeenCalledWith(":ok\n\n");
    cleanup();
  });

  it("refuses (401, no stream) and registers nothing when no session user is present", () => {
    const { res, cleanup } = connect(null);

    expect(res.writeHead).toHaveBeenCalledWith(401, expect.objectContaining({ "Content-Type": "application/json" }));
    expect(res.write).not.toHaveBeenCalledWith(":ok\n\n");

    // Not registered: a broadcast must not reach this response.
    res.write.mockClear();
    broadcast("new_shout", { id: "x" });
    expect(res.write).not.toHaveBeenCalled();
    cleanup();
  });

  it("removes the client and stops receiving broadcasts after close", () => {
    const { res, cleanup } = connect("user-1");
    cleanup(); // disconnect
    res.write.mockClear();

    broadcast("test_event", { x: 1 });
    expect(res.write).not.toHaveBeenCalled();
  });
});

// ── broadcast ─────────────────────────────────────────────────────────────────

describe("broadcast", () => {
  it("writes correctly formatted SSE payload to all connected clients", () => {
    const { res: res1, cleanup: c1 } = connect("user-1");
    const { res: res2, cleanup: c2 } = connect("user-2");
    res1.write.mockClear();
    res2.write.mockClear();

    broadcast("new_shout", { id: "abc" });

    const expected = `event: new_shout\ndata: ${JSON.stringify({ id: "abc" })}\n\n`;
    expect(res1.write).toHaveBeenCalledWith(expected);
    expect(res2.write).toHaveBeenCalledWith(expected);

    c1(); c2();
  });

  it("is a no-op when no clients are connected", () => {
    expect(() => broadcast("ping", {})).not.toThrow();
  });

  it("serialises data as JSON in the SSE frame", () => {
    const { res, cleanup } = connect("user-1");
    res.write.mockClear();

    broadcast("shout_like", { likes: 42, isLiked: true });

    const [call] = res.write.mock.calls;
    expect(call[0]).toContain(`"likes":42`);
    expect(call[0]).toContain(`"isLiked":true`);

    cleanup();
  });
});

// ── broadcastToUser ───────────────────────────────────────────────────────────

describe("broadcastToUser", () => {
  it("delivers only to the matching userId", () => {
    const { res: res1, cleanup: c1 } = connect("user-1");
    const { res: res2, cleanup: c2 } = connect("user-2");
    res1.write.mockClear();
    res2.write.mockClear();

    broadcastToUser("user-1", "notification", { msg: "hi" });

    const expected = `event: notification\ndata: ${JSON.stringify({ msg: "hi" })}\n\n`;
    expect(res1.write).toHaveBeenCalledWith(expected);
    expect(res2.write).not.toHaveBeenCalled();

    c1(); c2();
  });

  it("delivers to all connections for the same userId", () => {
    const { res: res1, cleanup: c1 } = connect("user-1");
    const { res: res2, cleanup: c2 } = connect("user-1"); // same user, two tabs
    res1.write.mockClear();
    res2.write.mockClear();

    broadcastToUser("user-1", "notification", { msg: "hello" });

    expect(res1.write).toHaveBeenCalled();
    expect(res2.write).toHaveBeenCalled();

    c1(); c2();
  });

  it("is a no-op when no matching user is connected", () => {
    expect(() => broadcastToUser("ghost", "event", {})).not.toThrow();
  });
});

// ── reapInvalidClients (server-side invalidation: FR-006, SC-005) ───────────────

describe("reapInvalidClients", () => {
  it("keeps a client whose session is valid and account active", async () => {
    const { res, cleanup } = connect("user-1");
    res.write.mockClear();

    await reapInvalidClients();

    expect(res.end).not.toHaveBeenCalled();
    broadcast("new_shout", { id: "still-here" });
    expect(res.write).toHaveBeenCalled(); // still registered
    cleanup();
  });

  it("drops a client whose session no longer has a user (signed out / expired)", async () => {
    const store = makeStore(null); // session gone
    const { res } = connect("user-1", { store });
    res.write.mockClear();

    await reapInvalidClients();

    expect(res.end).toHaveBeenCalled();
    broadcast("new_shout", { id: "gone" });
    expect(res.write).not.toHaveBeenCalled(); // no longer registered
  });

  it("drops a client whose account has been banned", async () => {
    const { res } = connect("user-1");
    findUnique.mockResolvedValue({ is_banned: 1 }); // banned after connecting
    res.write.mockClear();

    await reapInvalidClients();

    expect(res.end).toHaveBeenCalled();
    broadcast("new_shout", { id: "banned" });
    expect(res.write).not.toHaveBeenCalled();
  });

  it("drops a client whose account no longer exists", async () => {
    const { res } = connect("user-1");
    findUnique.mockResolvedValue(null); // deleted
    res.write.mockClear();

    await reapInvalidClients();

    expect(res.end).toHaveBeenCalled();
  });
});
