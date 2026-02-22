import { addClient } from "../sse.js";
import authRouter from "./auth.js";
import shoutsRouter from "./shouts.js";
import commentsRouter from "./comments.js";
import likesRouter from "./likes.js";
import usersRouter from "./users.js";
import uploadRouter from "./upload.js";
import announcementsRouter from "./announcements.js";
import notificationsRouter from "./notifications.js";

export function mountRoutes(app) {
  /* health */
  app.get("/api/v1/health", (_req, res) => res.json({ ok: true }));

  /* SSE event stream */
  app.get("/api/v1/events", (req, res) => addClient(req, res));

  /* me */
  app.get("/api/v1/me", (req, res) => {
    res.json({ user: req.session?.user ?? null });
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
}
