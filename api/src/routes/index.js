import { addClient } from "../sse.js";
import authRouter from "./auth.js";
import shoutsRouter from "./shouts.js";
import commentsRouter from "./comments.js";
import likesRouter from "./likes.js";
import usersRouter from "./users.js";
import uploadRouter from "./upload.js";
import announcementsRouter from "./announcements.js";
import notificationsRouter from "./notifications.js";
import ignoredUsersRouter from "./ignored-users.js";
import pollsRouter from "./polls.js";
import socialsRouter from "./socials.js";
import searchRouter from "./search.js";

const steamCache = new Map();
const STEAM_CACHE_TTL = 60 * 60 * 1000; // 1 hour

export function mountRoutes(app) {
  /* health */
  app.get("/api/v1/health", (_req, res) => res.json({ ok: true }));

  /* SSE event stream */
  app.get("/api/v1/events", (req, res) => addClient(req, res));

  /* me */
  app.get("/api/v1/me", (req, res) => {
    res.json({ user: req.session?.user ?? null });
  });

  /* Steam API proxy (avoids CORS issues with store.steampowered.com) */
  app.get("/api/v1/steam/app/:appId", async (req, res) => {
    const { appId } = req.params;
    if (!/^\d+$/.test(appId)) return res.status(400).json({ error: "Invalid app ID" });

    const cached = steamCache.get(appId);
    if (cached && Date.now() - cached.ts < STEAM_CACHE_TTL) {
      return res.json(cached.data);
    }

    try {
      const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&l=russian`;
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(`Steam API returned ${response.status}`);
      const data = await response.json();
      steamCache.set(appId, { data, ts: Date.now() });
      res.json(data);
    } catch (err) {
      console.error(`[Steam] Proxy error for app ${appId}:`, err.message);
      res.status(502).json({ error: "Failed to fetch Steam data" });
    }
  });

  /* domain routes */
  app.use("/api/v1", authRouter);
  app.use("/api/v1", shoutsRouter);
  app.use("/api/v1", commentsRouter);
  app.use("/api/v1", likesRouter);
  app.use("/api/v1", usersRouter);
  app.use("/api/v1", uploadRouter);
  app.use("/api/v1", announcementsRouter);
  app.use("/api/v1", notificationsRouter);
  app.use("/api/v1", ignoredUsersRouter);
  app.use("/api/v1", pollsRouter);
  app.use("/api/v1", socialsRouter);
  app.use("/api/v1", searchRouter);
}
