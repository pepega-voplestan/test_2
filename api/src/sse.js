/** SSE (Server-Sent Events) module — in-memory client management + broadcast.
 *
 * Only authenticated, active sessions are admitted: the `/api/v1/events` route
 * gates the request with `getRealtimeUserId` before calling `addClient`, so a
 * client is never stored with a null userId. Connections whose session later
 * becomes invalid (sign-out, expiry, ban) are reaped on the heartbeat cycle. */

import { prisma } from "./db.js";

const clients = new Map(); // clientId → { res, userId, sid, sessionStore }
let clientIdCounter = 0;

const isTest = process.env.NODE_ENV === "test";

export function addClient(req, res) {
  const userId = req.session?.user?.id;
  // Defensive: the route gate guarantees an authenticated, active user. If a
  // request somehow reaches here without one, refuse rather than open a stream.
  if (!userId) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(":ok\n\n");

  const clientId = String(++clientIdCounter);
  clients.set(clientId, { res, userId, sid: req.sessionID, sessionStore: req.sessionStore });

  console.log(`[SSE] Client connected: ${clientId} (user=${userId}), total=${clients.size}`);

  req.on("close", () => {
    clients.delete(clientId);
    console.log(`[SSE] Client disconnected: ${clientId}, total=${clients.size}`);
  });
}

export function getClientStats() {
  const loggedInUserIds = new Set();
  for (const [, { userId }] of clients) {
    loggedInUserIds.add(userId);
  }
  return { total: clients.size, loggedIn: loggedInUserIds.size, loggedInUserIds: [...loggedInUserIds] };
}

export function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [, client] of clients) {
    client.res.write(payload);
  }
}

export function broadcastToUser(userId, event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [, client] of clients) {
    if (client.userId === userId) {
      client.res.write(payload);
    }
  }
}

/** Promise wrapper around the session store's callback-style get(). */
function loadSession(sessionStore, sid) {
  return new Promise((resolve) => {
    if (!sessionStore || !sid) return resolve(null);
    sessionStore.get(sid, (err, session) => resolve(err ? null : session));
  });
}

/** A connection stays valid only while its session still holds a user AND that
 *  account is still active (exists, not banned). */
async function isClientValid({ sid, sessionStore, userId }) {
  const session = await loadSession(sessionStore, sid);
  if (!session || !session.user) return false; // signed out or expired

  const account = await prisma.user.findUnique({ where: { id: userId }, select: { is_banned: true } });
  if (!account || account.is_banned) return false; // deleted or banned

  return true;
}

/** Drop connections whose session has become unauthenticated/invalid so that
 *  realtime delivery ceases within one heartbeat cycle (FR-006, SC-005). */
export async function reapInvalidClients() {
  for (const [clientId, client] of clients) {
    const valid = await isClientValid(client);
    if (!valid) {
      try { client.res.end(); } catch { /* connection already gone */ }
      clients.delete(clientId);
      console.log(`[SSE] Client reaped (session no longer valid): ${clientId}, total=${clients.size}`);
    }
  }
}

// Heartbeat every 30s: reap invalidated sessions, then ping survivors to keep
// connections alive through proxies. Skipped under test (driven directly).
if (!isTest) {
  setInterval(async () => {
    await reapInvalidClients();
    for (const [, client] of clients) {
      client.res.write(":ping\n\n");
    }
  }, 30_000);
}
