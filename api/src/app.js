import express from "express";
import session from "express-session";
import rateLimit from "express-rate-limit";
import { mountRoutes } from "./routes/index.js";

const isTest = process.env.NODE_ENV === "test";
const isProd = process.env.NODE_ENV === "production";

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "50kb" }));

// Request logging middleware (skip in test)
if (!isTest) {
  app.use((req, _res, next) => {
    console.log(`[API] ${req.method} ${req.url}`);
    next();
  });
}

// ── AdminJS admin panel (skip in test) ──
if (!isTest) {
  try {
    const { setupAdmin } = await import("./admin.js");
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
}

// ── Session middleware ──
if (isTest) {
  // In-memory sessions for tests (no SQLite session file needed)
  app.use(
    session({
      secret: "test-secret",
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, sameSite: "lax", secure: false },
    })
  );
} else {
  const { RedisStore } = await import("connect-redis");
  const { default: Redis } = await import("ioredis");

  const redisClient = new Redis({
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT) || 6379,
  });

  const SESSION_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

  app.use(
    session({
      store: new RedisStore({ client: redisClient, ttl: SESSION_MAX_AGE / 1000 }),
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
}

// ── Rate limiting (disabled in test) ──
if (!isTest) {
  const authLimiter = rateLimit({ windowMs: 60_000, max: 20 });
  app.use("/api/v1/auth/login", authLimiter);
  app.use("/api/v1/auth/register/send-code", authLimiter);
  app.use("/api/v1/auth/register/verify", authLimiter);

  const resetCodeLimiter = rateLimit({ windowMs: 60_000, max: 5, message: { error: "Слишком много запросов. Подождите минуту" } });
  app.use("/api/v1/auth/forgot-password/send-code", resetCodeLimiter);
  app.use("/api/v1/auth/forgot-password/reset", authLimiter);

  // Email change code sending (same rate as password reset)
  app.use("/api/v1/users/:id/email/send-code", resetCodeLimiter);

  const perUserKey = (req) => req.session?.user?.id || req.ip;
  const uploadLimiter = rateLimit({ windowMs: 10 * 60_000, max: 100, keyGenerator: perUserKey, message: { error: "Слишком много загрузок. Подождите немного" } });
  const postLimiter = rateLimit({ windowMs: 10 * 60_000, max: 100, keyGenerator: perUserKey, message: { error: "Слишком много воплей. Подождите немного" } });
  app.use("/api/v1/upload/media", uploadLimiter);
  app.use("/api/v1/shouts", postLimiter);
}

// Swagger UI — dev only
if (!isProd && !isTest) {
  const swaggerUi = (await import("swagger-ui-express")).default;
  const { swaggerSpec } = await import("./swagger.js");
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  console.log("[API] Swagger UI available at /api/docs");
}

// In dev, serve media files directly
if (!isProd && !isTest) {
  const mediaPath = process.env.MEDIA_PATH;
  if (mediaPath) {
    app.use("/media", express.static(mediaPath, {
      maxAge: "1d",
      setHeaders: (res) => {
        res.setHeader("X-Content-Type-Options", "nosniff");
      },
    }));
  }
}

mountRoutes(app);

export default app;
