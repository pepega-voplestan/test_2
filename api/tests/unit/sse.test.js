import { describe, it, expect, vi, beforeEach } from "vitest";
import EventEmitter from "events";
import { addClient, broadcast, broadcastToUser } from "../../src/sse.js";

/** Create a mock request with optional session userId */
function makeReq(userId = null) {
  const emitter = new EventEmitter();
  emitter.session = userId ? { user: { id: userId } } : null;
  return emitter;
}

/** Create a mock response with write/writeHead spies */
function makeRes() {
  return { writeHead: vi.fn(), write: vi.fn() };
}

/**
 * Add a client and return a cleanup function that simulates disconnect.
 * Always call cleanup() after the test so the module's client map stays clean.
 */
function connect(userId = null) {
  const req = makeReq(userId);
  const res = makeRes();
  addClient(req, res);
  const cleanup = () => req.emit("close");
  return { req, res, cleanup };
}

// Each test starts with a clean client list by disconnecting after use.
// Since sse.js keeps module-level state we use beforeEach to ensure any
// leftover clients from a previously failed test are gone.
beforeEach(() => {
  // Nothing to reset — each test is responsible for its own cleanup via cleanup().
  vi.clearAllMocks();
});

// ── addClient ─────────────────────────────────────────────────────────────────

describe("addClient", () => {
  it("writes SSE headers with content-type text/event-stream", () => {
    const { res, cleanup } = connect();
    expect(res.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ "Content-Type": "text/event-stream" })
    );
    cleanup();
  });

  it("sends the :ok handshake on connect", () => {
    const { res, cleanup } = connect();
    expect(res.write).toHaveBeenCalledWith(":ok\n\n");
    cleanup();
  });

  it("removes the client and stops receiving broadcasts after close", () => {
    const { res, cleanup } = connect();
    cleanup(); // disconnect
    res.write.mockClear();

    broadcast("test_event", { x: 1 });
    expect(res.write).not.toHaveBeenCalled();
  });
});

// ── broadcast ─────────────────────────────────────────────────────────────────

describe("broadcast", () => {
  it("writes correctly formatted SSE payload to all connected clients", () => {
    const { res: res1, cleanup: c1 } = connect();
    const { res: res2, cleanup: c2 } = connect();
    res1.write.mockClear();
    res2.write.mockClear();

    broadcast("new_shout", { id: "abc" });

    const expected = `event: new_shout\ndata: ${JSON.stringify({ id: "abc" })}\n\n`;
    expect(res1.write).toHaveBeenCalledWith(expected);
    expect(res2.write).toHaveBeenCalledWith(expected);

    c1(); c2();
  });

  it("is a no-op when no clients are connected", () => {
    // Should not throw
    expect(() => broadcast("ping", {})).not.toThrow();
  });

  it("serialises data as JSON in the SSE frame", () => {
    const { res, cleanup } = connect();
    res.write.mockClear();

    const data = { likes: 42, isLiked: true };
    broadcast("shout_like", data);

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

  it("does not write to anonymous (userId=null) clients", () => {
    const { res, cleanup } = connect(null); // anonymous
    res.write.mockClear();

    broadcastToUser("user-1", "notification", {});

    expect(res.write).not.toHaveBeenCalled();
    cleanup();
  });

  it("is a no-op when no matching user is connected", () => {
    expect(() => broadcastToUser("ghost", "event", {})).not.toThrow();
  });
});
