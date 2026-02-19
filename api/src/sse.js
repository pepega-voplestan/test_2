/** SSE (Server-Sent Events) module — in-memory client management + broadcast */

const clients = new Map(); // clientId → { res, userId }
let clientIdCounter = 0;

export function addClient(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(":ok\n\n");

  const clientId = String(++clientIdCounter);
  const userId = req.session?.user?.id || null;
  clients.set(clientId, { res, userId });

  console.log(`[SSE] Client connected: ${clientId} (user=${userId || "anon"}), total=${clients.size}`);

  req.on("close", () => {
    clients.delete(clientId);
    console.log(`[SSE] Client disconnected: ${clientId}, total=${clients.size}`);
  });
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

// Heartbeat every 30s to keep connections alive through proxies
setInterval(() => {
  for (const [, client] of clients) {
    client.res.write(":ping\n\n");
  }
}, 30_000);
