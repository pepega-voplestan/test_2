import express from "express";
import session from "express-session";
import rateLimit from "express-rate-limit";
import SQLiteStoreFactory from "connect-sqlite3";
import { mountRoutes } from "./routes.js";
import "./db.js";

const isProd = process.env.NODE_ENV === "production";

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "50kb" }));

// Request logging middleware
app.use((req, _res, next) => {
  console.log(`[API] ${req.method} ${req.url}`);
  next();
});

const SQLiteStore = SQLiteStoreFactory(session);

app.use(
  session({
    store: new SQLiteStore({ db: "sessions.sqlite", dir: "/data" }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProd,
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
