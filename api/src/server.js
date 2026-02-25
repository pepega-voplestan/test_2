import "dotenv/config";
import express from "express";
import session from "express-session";
import rateLimit from "express-rate-limit";
import SQLiteStoreFactory from "connect-sqlite3";
import { mountRoutes } from "./routes/index.js";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./swagger.js";
import { prisma } from "./db.js";
import { toSqliteDatetime } from "./helpers/common.js";
import { setupAdmin } from "./admin.js";

const isProd = process.env.NODE_ENV === "production";

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "50kb" }));

// Console request logging
app.use((req, _res, next) => {
  console.log(`[API] ${req.method} ${req.url}`);
  next();
});

// ── AdminJS admin panel ──
// Mounted BEFORE the app session middleware so it uses its own isolated session.
try {
  const adminLoginLimiter = rateLimit({ windowMs: 15 * 60_000, max: 10, message: "Too many login attempts" });
  app.use("/admin/login", adminLoginLimiter);

  const { admin, adminRouter } = await setupAdmin();
  app.use(admin.options.rootPath, adminRouter);
  console.log(`[API] Admin panel available at ${admin.options.rootPath}`);
} catch (err) {
  console.error("[API] Failed to set up admin panel:", err.message);
  if (isProd) {
    console.error("[API] Admin panel is required in production. Exiting.");
    process.exit(1);
  }
  console.error("[API] Server will continue without admin panel in dev mode.");
}

// ── App session middleware (does NOT apply to /admin — already handled above) ──
const SQLiteStore = SQLiteStoreFactory(session);

const SESSION_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

app.use(
  session({
    store: new SQLiteStore({ db: "sessions.sqlite", dir: "/data" }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProd,
      maxAge: SESSION_MAX_AGE,
    },
  })
);

// Rate limiting
const authLimiter = rateLimit({ windowMs: 60_000, max: 20 });
app.use("/api/v1/auth/login", authLimiter);
app.use("/api/v1/auth/register/send-code", authLimiter);
app.use("/api/v1/auth/register/verify", authLimiter);

// Stricter rate limit for password reset code sending (5 per minute)
const resetCodeLimiter = rateLimit({ windowMs: 60_000, max: 5, message: { error: "Слишком много запросов. Подождите минуту" } });
app.use("/api/v1/auth/forgot-password/send-code", resetCodeLimiter);
app.use("/api/v1/auth/forgot-password/reset", authLimiter);

// Per-user rate limiting: 100 requests per 10 min (keyed by user id, falls back to IP for anonymous)
const perUserKey = (req) => req.session?.user?.id || req.ip;
const uploadLimiter = rateLimit({ windowMs: 10 * 60_000, max: 100, keyGenerator: perUserKey, message: { error: "Слишком много загрузок. Подождите немного" } });
const postLimiter = rateLimit({ windowMs: 10 * 60_000, max: 100, keyGenerator: perUserKey, message: { error: "Слишком много воплей. Подождите немного" } });
app.use("/api/v1/upload/media", uploadLimiter);
app.use("/api/v1/shouts", postLimiter);

// Swagger UI — dev only
if (!isProd) {
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  console.log("[API] Swagger UI available at /api/docs");
}

// In dev, serve media files directly (in prod, the media container does this)
if (!isProd) {
  const mediaPath = process.env.MEDIA_PATH;
  app.use("/media", express.static(mediaPath, {
    maxAge: "1d",
    setHeaders: (res) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
    },
  }));
}

mountRoutes(app);

app.listen(3000, () => console.log(`[API] Server listening on :3000 (env=${process.env.NODE_ENV})`));

// ── Seed default settings ──
async function seedSettings() {
  await prisma.setting.upsert({
    where: { key: "registration_open" },
    update: {},
    create: { key: "registration_open", value: "true" },
  });
  console.log("[Settings] Default settings seeded");
}
seedSettings().catch((err) => console.error("[Settings] Seed error:", err));

// Periodic cleanup: hard-delete notifications older than 14 days
const NOTIFICATION_TTL_DAYS = 14;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h

async function cleanupOldNotifications() {
  const cutoff = toSqliteDatetime(new Date(Date.now() - NOTIFICATION_TTL_DAYS * 24 * 60 * 60 * 1000));
  const { count } = await prisma.notification.deleteMany({
    where: { created_at: { lt: cutoff } },
  });
  if (count > 0) console.log(`[Cleanup] Deleted ${count} notifications older than ${NOTIFICATION_TTL_DAYS} days`);
}

cleanupOldNotifications().catch((err) => console.error("[Cleanup] Error:", err));
setInterval(
  () => cleanupOldNotifications().catch((err) => console.error("[Cleanup] Error:", err)),
  CLEANUP_INTERVAL_MS
);

// Graceful shutdown — close Prisma connection
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, async () => {
    console.log(`[API] ${signal} received, shutting down...`);
    await prisma.$disconnect();
    process.exit(0);
  });
}
