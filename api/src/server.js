import express from "express";
import session from "express-session";
import rateLimit from "express-rate-limit";
import SQLiteStoreFactory from "connect-sqlite3";
import { mountRoutes } from "./routes.js";
import "./db.js";

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "50kb" }));

const SQLiteStore = SQLiteStoreFactory(session);

app.use(
  session({
    store: new SQLiteStore({ db: "sessions.sqlite", dir: "/data" }),
    secret: process.env.SESSION_SECRET || "dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: true, // т.к. снаружи https через Cloudflare
    },
  })
);

// анти-брутфорс на auth
const authLimiter = rateLimit({ windowMs: 60_000, max: 20 });
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);

mountRoutes(app);

app.listen(3000, () => console.log("API listening on :3000"));

app.set("trust proxy", 1);

const isProd = process.env.NODE_ENV === "production";

app.use(
  session({
    store: new SQLiteStore({ db: "sessions.sqlite", dir: "/data" }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    proxy: true, // <-- ВАЖНО для secure cookies за прокси
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: true, // true в проде (через Cloudflare), false локально
    },
  })
);
