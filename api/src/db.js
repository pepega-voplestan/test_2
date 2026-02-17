import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const dbPath = process.env.DATABASE_PATH || "/data/app.db";
const dbDir = path.dirname(dbPath);

fs.mkdirSync(dbDir, { recursive: true });
console.log(`[DB] Opening database at ${dbPath}`);

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  avatar TEXT NOT NULL,
  is_banned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shouts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  parent_id TEXT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (parent_id) REFERENCES shouts(id)
);

CREATE INDEX IF NOT EXISTS idx_shouts_parent_created
  ON shouts(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_shouts_created
  ON shouts(created_at);

CREATE TABLE IF NOT EXISTS shout_likes (
  shout_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (shout_id, user_id),
  FOREIGN KEY (shout_id) REFERENCES shouts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_likes_shout ON shout_likes(shout_id);
CREATE INDEX IF NOT EXISTS idx_likes_user ON shout_likes(user_id);
`);

console.log("[DB] Schema initialized");
