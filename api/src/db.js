import Database from "better-sqlite3";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const dbPath = process.env.DATABASE_PATH;
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

// Separate comments table — comments are not shouts, they belong to a shout as a thread
db.exec(`
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  shout_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  media_id TEXT DEFAULT NULL,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (shout_id) REFERENCES shouts(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (media_id) REFERENCES media(id)
);

CREATE INDEX IF NOT EXISTS idx_comments_shout_created ON comments(shout_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_user ON comments(user_id);
`);

// Create comment_likes table
db.exec(`
CREATE TABLE IF NOT EXISTS comment_likes (
  comment_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (comment_id, user_id),
  FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_comment_likes_comment ON comment_likes(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_likes_user ON comment_likes(user_id);
`);

// Migrate existing replies (shouts with parent_id) → comments table (one-time)
const replyRows = db.prepare(
  `SELECT id, parent_id, user_id, content, media_id, is_deleted, created_at
   FROM shouts WHERE parent_id IS NOT NULL`
).all();

if (replyRows.length) {
  // Check if any have already been migrated
  const alreadyMigrated = db.prepare(
    `SELECT COUNT(*) AS c FROM comments WHERE id IN (${replyRows.map(() => "?").join(",")})`
  ).get(...replyRows.map(r => r.id));

  const toMigrate = alreadyMigrated.c === 0 ? replyRows : [];
  if (toMigrate.length) {
    const insertComment = db.prepare(
      `INSERT OR IGNORE INTO comments (id, shout_id, user_id, content, media_id, is_deleted, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    // Migrate likes for replies → comment_likes
    const migrateReplyLikes = db.prepare(
      `INSERT OR IGNORE INTO comment_likes (comment_id, user_id, created_at)
       SELECT shout_id, user_id, created_at FROM shout_likes WHERE shout_id = ?`
    );
    const migrate = db.transaction((rows) => {
      for (const row of rows) {
        insertComment.run(row.id, row.parent_id, row.user_id, row.content, row.media_id, row.is_deleted, row.created_at);
        migrateReplyLikes.run(row.id);
      }
    });
    migrate(toMigrate);
    console.log(`[DB] Migrated ${toMigrate.length} reply row(s) from shouts to comments table`);
  }
}

// Verification codes table for email verification (registration & password reset)
db.exec(`
CREATE TABLE IF NOT EXISTS verification_codes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  purpose TEXT NOT NULL,
  payload TEXT,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_verification_codes_email_purpose
  ON verification_codes(email, purpose, used);
`);

console.log("[DB] Schema initialized");
