import Database from "better-sqlite3";
import crypto from "crypto";
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

// Add email column if it doesn't exist (migration-safe)
try {
  db.exec(`ALTER TABLE users ADD COLUMN email TEXT DEFAULT NULL`);
  console.log("[DB] Added email column to users");
} catch (_e) {
  // Column already exists — ignore
}

// If email column has NOT NULL constraint (from older migration), recreate table to fix it
try {
  db.prepare(`UPDATE users SET email = NULL WHERE email = ''`).run();
} catch (e) {
  if (e.code === 'SQLITE_CONSTRAINT_NOTNULL') {
    console.log("[DB] Fixing email column NOT NULL constraint via table rebuild");
    db.pragma("foreign_keys = OFF");
    db.exec(`
      CREATE TABLE users_new (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        avatar TEXT NOT NULL,
        is_banned INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        email TEXT DEFAULT NULL
      );
      INSERT INTO users_new SELECT id, username, password_hash, avatar, is_banned, created_at,
        CASE WHEN email = '' THEN NULL ELSE email END
        FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
    `);
    db.pragma("foreign_keys = ON");
    console.log("[DB] Table rebuilt with nullable email column");
  } else {
    throw e;
  }
}

// Drop any stale email index from previous migrations, then create clean partial unique index
db.exec(`DROP INDEX IF EXISTS idx_users_email`);

// Deduplicate emails: if multiple users share the same non-NULL email, keep the newest, NULL the rest
const dupes = db.prepare(`
  SELECT email FROM users
  WHERE email IS NOT NULL AND email != ''
  GROUP BY email HAVING COUNT(*) > 1
`).all();
for (const { email } of dupes) {
  const rows = db.prepare(
    `SELECT id FROM users WHERE email = ? ORDER BY created_at DESC`
  ).all(email);
  // Keep the first (newest), NULL out the rest
  for (let i = 1; i < rows.length; i++) {
    db.prepare(`UPDATE users SET email = NULL WHERE id = ?`).run(rows[i].id);
  }
}
if (dupes.length) console.log(`[DB] Deduplicated ${dupes.length} email(s)`);

db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL`);

// Legacy inline media columns (migration-safe, kept for backward compat during transition)
try {
  db.exec(`ALTER TABLE shouts ADD COLUMN media_type TEXT DEFAULT NULL`);
  db.exec(`ALTER TABLE shouts ADD COLUMN media_url TEXT DEFAULT NULL`);
  db.exec(`ALTER TABLE shouts ADD COLUMN media_meta TEXT DEFAULT NULL`);
} catch (_e) {
  // Columns already exist
}

// Separate media table — decoupled from shouts so media schema can evolve independently
db.exec(`
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  media_type TEXT NOT NULL,
  media_url TEXT NOT NULL,
  media_meta TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
`);

// Add media_id FK column to shouts
try {
  db.exec(`ALTER TABLE shouts ADD COLUMN media_id TEXT DEFAULT NULL REFERENCES media(id)`);
  console.log("[DB] Added media_id column to shouts");
} catch (_e) {
  // Column already exists
}

// Migrate any existing inline media data → media table (one-time)
const inlineMedia = db.prepare(
  `SELECT id, user_id, media_type, media_url, media_meta FROM shouts WHERE media_type IS NOT NULL AND media_id IS NULL`
).all();
if (inlineMedia.length) {
  const insertMedia = db.prepare(
    `INSERT OR IGNORE INTO media (id, user_id, media_type, media_url, media_meta) VALUES (?, ?, ?, ?, ?)`
  );
  const linkShout = db.prepare(`UPDATE shouts SET media_id = ? WHERE id = ?`);
  const migrate = db.transaction((rows) => {
    for (const row of rows) {
      const mediaId = crypto.randomUUID();
      insertMedia.run(mediaId, row.user_id, row.media_type, row.media_url, row.media_meta);
      linkShout.run(mediaId, row.id);
    }
  });
  migrate(inlineMedia);
  console.log(`[DB] Migrated ${inlineMedia.length} inline media row(s) to media table`);
}

// Add is_deleted column to shouts for soft-delete (migration-safe)
try {
  db.exec(`ALTER TABLE shouts ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0`);
  console.log("[DB] Added is_deleted column to shouts");
} catch (_e) {
  // Column already exists
}

console.log("[DB] Schema initialized");
