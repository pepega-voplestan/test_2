# API Reference

## Repository Structure (api/)

```
api/src/
├── server.js           # Entrypoint: dotenv, imports app.js, seeds settings
├── app.js              # Express app factory: middleware, session, admin, swagger, routes
├── admin.js            # AdminJS panel setup + custom dashboard
├── admin-dashboard.jsx # Custom AdminJS dashboard: analytics, timelines, top creators
├── swagger.js          # OpenAPI 3.0.3 spec (dev only, blocked in prod)
├── db.js               # Prisma client
├── auth.js             # Password hashing, session auth utilities
├── email.js            # Email via nodemailer + Resend SMTP
├── sse.js              # SSE: client registry, broadcast, broadcastToUser, heartbeat
├── routes/
│   ├── index.js            # Mounts all routers via mountRoutes(app)
│   ├── auth.js             # Register, login, logout, password reset
│   ├── shouts.js           # Shout CRUD + replies + single fetch + poll creation
│   ├── comments.js         # Comment CRUD + reply/mention notifications
│   ├── likes.js            # Shout and comment like toggles
│   ├── users.js            # User profile + mentions autocomplete + email change
│   ├── upload.js           # Media and avatar upload
│   ├── announcements.js    # Announcement read/write
│   ├── notifications.js    # Notification fetch + mark-read
│   ├── ignored-users.js    # Ignored users list, add, remove
│   ├── polls.js            # Poll voting
│   ├── search.js           # User + shout full-text search via pg_trgm; respects session NSFW/politics prefs
│   └── socials.js          # Social links CRUD (14 platforms)
└── helpers/
    ├── common.js           # asyncHandler, requireAuth, shared middleware
    ├── feed.js             # enrichFeed: joins users/media/likes/polls onto rows
    ├── media.js            # Sharp processing, GIF handling, avatar generation
    ├── mentions.js         # extractMentionedUserIds, buildSnippet
    ├── socials.js          # Platform validation, URL normalization, display extraction
    └── validation.js       # Zod schemas shared across routes
```

## API Endpoints

All prefixed `/api/v1/`. Auth = session cookie required. Full spec at `/api/docs` (dev only).

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/events` | Yes | SSE stream — active authenticated session only; 401 for anonymous/banned/deleted |
| GET | `/steam/app/:appId` | — | Steam store proxy (1h cache, avoids CORS) |
| POST | `/auth/register/send-code` | — | Send email code (rate: 20/min; blocked if `registration_open=false`) |
| POST | `/announcements` | Secret | Replace announcement (requires `ANNOUNCEMENTS_SECRET`; soft-deletes all previous) |
| GET | `/users/mentions` | — | All non-banned users for @mention autocomplete |
| GET | `/shouts` | — | `limit`, `offset`, `sortBy=new\|popular`, max 50 |
| GET | `/search` | — | `q`, `type=shouts\|users`, `userId?`, `limit`, `offset`; NSFW/politics filtered by session prefs (guests default both off); frontend hides from unauthenticated users |
| PUT | `/shouts/:id` | Yes | Edit shout content (author only, within 60s of creation; `EDIT_WINDOW_MS`) |
| PUT | `/comments/:id` | Yes | Edit comment content (author only, within 60s of creation; `EDIT_WINDOW_MS`) |
| POST | `/upload/media` | Yes | ≤`ORIGINAL_QUALITY_MAX_BYTES` (10MB) JPG/PNG/WebP/GIF/MP4; images generate 320/960/1600px WebP. JPG/PNG also keep a lossless, metadata-stripped `original.<ext>` served at full size for 24h (see Original-Quality Uploads) |
| POST | `/upload/avatar` | Yes | ≤2MB; generates 64/128/256px square WebP |
| GET | `/notifications` | Yes | Cursor-paginated (14-day window, default 20, max 50); `cursor` = ISO timestamp |
| PATCH | `/notifications/read-batch` | Yes | Mark batch as read (max 50 ids) |
| POST | `/users/:id/ignore` | Yes | Ignore user (max 3 total) |
| POST | `/polls/:pollId/vote` | Yes | `{ optionIds: string[] }` — one-time, 400 on re-vote |

## Admin Panel

`/admin` — double-protected: Nginx HTTP Basic Auth (`.htpasswd`) + AdminJS login (`ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`).

Generate htpasswd: `docker run --rm httpd:alpine htpasswd -nbB admin_username YOUR_PASSWORD > .htpasswd`

| Section | Capabilities |
|---------|-------------|
| Пользователи (Users) | View, edit, ban/unban (ban sets `is_deleted=2` on their content) |
| Вопли (Shouts) | View, soft-delete, restore; toggle `is_pinned` (one at a time) |
| Комменты (Comments) | View, soft-delete, restore |
| Медиа (Media) | Read-only |
| Объявления (Announcements) | Create (auto-soft-deletes previous), soft-delete |
| Настройки (Settings) | Edit key-value settings (e.g. `registration_open`) |

**Custom dashboard**: analytics with 1/7/30/90/all-time filters — key metrics, top creators bar chart, timeline charts for shouts/comments/likes/registrations.

**Setup**: skipped in test mode; non-fatal in dev (server continues without admin); fatal in production (exits code 1).

**Swagger UI** at `/api/docs` — dev only, blocked by nginx in production.

## SSE Real-Time Events

Single shared `EventSource` in `SSEContext.tsx`. All consumers subscribe via `subscribe(event, handler)`. `useSSE(listeners)` is a thin convenience wrapper. Heartbeat every 30s. Exponential backoff reconnect (1s→30s max).

**Authenticated only**: `GET /api/v1/events` is gated server-side by `getRealtimeUserId(req)` (in `auth.js`), which returns the user id only when the session has a user AND a Prisma `is_banned` lookup confirms the account exists and is active. Anonymous, banned, or deleted-account requests get `401 { error: "Unauthorized" }` **before** any `text/event-stream` headers, so the browser `EventSource` never establishes a stream. `addClient` only ever registers clients with a real `userId` — there are no anonymous/`null` clients. Each client entry also stores `sid`/`sessionStore`, and the 30s heartbeat first calls `reapInvalidClients()`, which re-loads each client's session via `sessionStore.get(sid)` and re-checks the account; connections whose session has signed out, expired, or been banned/deleted are closed and dropped within one cycle (so delivery stops authoritatively, not just when the client disconnects).

**Broadcast (all clients):**

| Event | Payload | Trigger |
|-------|---------|---------|
| `new_shout` | Shout object | Shout created |
| `delete_shout` | `{ id }` | Shout soft-deleted |
| `new_comment` | Comment object | Comment added |
| `delete_comment` | `{ id, shoutId }` | Comment soft-deleted |
| `shout_like` | `{ id, likes }` | Shout like toggled |
| `comment_like` | `{ id, likes }` | Comment like toggled |
| `poll_update` | `{ pollId, options: [{ id, votes }], totalVoters }` | Poll vote cast |
| `pin_shout` | `{ shoutId }` | Admin pins a shout |
| `unpin_shout` | `{ shoutId }` | Admin unpins a shout |
| `edit_shout` | `{ shoutId, content }` | Shout content edited by author |
| `edit_comment` | `{ shoutId, commentId, content }` | Comment content edited by author |

**Targeted (`broadcastToUser`):**

| Event | Payload | Trigger |
|-------|---------|---------|
| `notification` | `{ id, type, actor, shoutId, commentId, isRead, timestamp, snippet }` | @mention or reply |

SSE real-time updates only apply to the `new` tab. Popular and announcements tabs load on demand.

## Notification System

**Types:** `mention` (user @mentioned in shout/comment), `reply` (comment on your shout not already a mention; OR sent to the author of a directly-quoted comment via `replyToId`).

**Lifecycle:**
- Created in `routes/shouts.js` (mention in new shouts) and `routes/comments.js` (mention + reply).
- `helpers/mentions.js`: `extractMentionedUserIds(content, actorId)` parses `@[username:userId]` tokens; `buildSnippet(content, maxLen=60)` generates previews. Snippets are spoiler-aware: `||…||` → asterisks; `politics` tag → "ПОЛИТИКА"; `spoiler`/`nsfw` → "СПОЙЛЕР".
- Self-mentions excluded. Hard-deleted after 14 days by workers cleanup job.
- Frontend fetches on login (cursor-paginated, 14-day window, page 20). New arrive via SSE, prepended, deduplicated by `id`.
- Read marking: 800ms hover queues item; batch sent on dropdown close or 5s safety flush via `PATCH /notifications/read-batch`. Dropdown list frozen while open.
- **Browser tab indicator**: `(N) Вопли` title + Canvas API favicon red dot badge. Cleared when `unreadCount=0`.

**`NotificationsContext.tsx`** exposes: `sortedNotifications`, `unreadCount`, `hasMore`, `isLoadingMore`, `loadMore`, `markAsRead`, `markAllAsRead`, `flushReads`.

## Database

PostgreSQL 16. Managed via Prisma. `prisma migrate deploy` on Docker startup. All historical migrations squashed into a single `0001_init` baseline. Sessions stored in Redis.

**Migration / FK conventions**: IDs (UUIDs) are never updated in this project. Do not add `ON UPDATE CASCADE` to FK constraints — it will never fire and is dead boilerplate. Always use `ON UPDATE NO ACTION` (Prisma: `onUpdate: NoAction`) explicitly instead of relying on Prisma's default of `Cascade`.

### Models

**User** (`users`)
- `id` (UUID, PK), `username` (UNIQUE), `password_hash`, `avatar`, `email` (UNIQUE?), `is_banned` (0/1), `show_nsfw` (0/1), `show_politics` (0/1), `created_at`
- Relations: `receivedNotifications`, `sentNotifications`, `ignoredByMe`, `ignoredByOthers`, `socials`

**Shout** (`shouts`)
- `id` (UUID), `user_id`→users, `parent_id` (legacy, unused), `content`, `visibility_tag` (""|spoiler|nsfw|politics), `is_pinned` (0/1), `is_deleted` (0/1/2), `created_at`
- Optional one-to-one `poll` relation
- Media lives entirely in `ShoutMedia` (see below) — there is no `media_id`/`media_type`/`media_url`/`media_meta` column on this table (feature 006 migration removed them)
- Indices: `(parent_id, created_at)`, `(created_at)`

**Comment** (`comments`)
- `id`, `shout_id`→shouts, `user_id`→users, `content`, `reply_to`→comments? (self-referential "CommentReplies"; SET NULL on delete), `is_deleted`, `created_at`
- Media lives entirely in `CommentMedia` (see below), same as Shout
- Indices: `(shout_id, created_at)`, `(user_id)`

**Media** (`media`)
- `id`, `user_id`→users, `media_type` (image|youtube), `media_url` (relative path or video ID), `media_meta` (JSON), `created_at`
- `media_meta` JSON: `{w, h, size, mime, animated}`. Original-quality JPG/PNG additionally carry `{orig: "original.<ext>", uploaded_at, converted, orientation?}` until downgraded (see Original-Quality Uploads).

**ShoutMedia** (`shout_media`) / **CommentMedia** (`comment_media`) — feature 006
- Composite PK `(shout_id, position)` / `(comment_id, position)`, plus `media_id`→media, `@@unique([shout_id, media_id])`
- The **only** place a shout's/comment's attachment(s) live — a single image/video/YouTube/GIF is a one-row list here, a gallery is a 2–5-row list, position 0 is always the preview item. Written only by `helpers/attachments.js` — never insert into these tables from anywhere else.
- Cap of 5 images per gallery, and images/YouTube/GIF/video are mutually exclusive within one shout or comment, enforced server-side in `helpers/attachments.js` (frontend gates are a secondary guard only). Immutable once published — no endpoint adds/removes/reorders rows after creation.

**ShoutLike** (`shout_likes`) — composite PK `(shout_id, user_id)`, cascade deletes

**CommentLike** (`comment_likes`) — composite PK `(comment_id, user_id)`, cascade deletes

**Announcement** (`announcements`)
- `id`, `title` (VARCHAR 200, default ""), `content`, `is_deleted`, `created_at`
- Index: `(is_deleted, created_at)`. Single-active-record: new POST soft-deletes all previous.

**VerificationCode** (`verification_codes`)
- `id`, `email`, `code`, `purpose` (register|reset), `payload` (JSON?), `expires_at`, `used`, `attempts`, `created_at`
- Index: `(email, purpose, used)`

**Notification** (`notifications`)
- `id`, `user_id`→users (CASCADE, recipient), `actor_id`→users (CASCADE), `type` (mention|reply), `shout_id`→shouts (SET NULL on delete)?, `comment_id`→comments (SET NULL on delete)?, `is_read`, `created_at`
- Index: `(user_id, is_read, created_at)` — efficient unread fetch
- Hard-deleted after 14 days

**Poll** (`polls`)
- `id`, `shout_id`→shouts (UNIQUE, CASCADE), `multi` (0=single-select, 1=multi-select)

**PollOption** (`poll_options`)
- `id`, `poll_id`→polls (CASCADE), `text` (max 144 chars), `votes`; index `(poll_id)`

**PollVote** (`poll_votes`)
- `id`, `option_id`→poll_options (CASCADE), `user_id` (no FK), `created_at`
- UNIQUE `(option_id, user_id)` — prevents duplicate votes; index `(user_id)`

**Setting** (`settings`) — `key` (PK), `value`; seeded on startup, editable via admin panel

**IgnoredUser** (`ignored_users`)
- `id`, `owner_user_id`→users (CASCADE), `target_user_id`→users (CASCADE), `created_at`, `updated_at`
- UNIQUE `(owner_user_id, target_user_id)`; max 3 per owner (enforced in route)

**Social** (`socials`)
- `id`, `user_id`→users (CASCADE), `type` (steam|playstation|xbox|battlenet|epicgames|retroachievements|exophase|backloggd|youtube|myshows|telegram|x|discord|boosty), `url`, `display_name` (default ""), `created_at`, `updated_at`
- UNIQUE `(user_id, type)` — one per platform per user; index `(user_id)`

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | Prisma PostgreSQL URL (e.g. `postgresql://vopley:pass@postgres:5432/vopley`) |
| `TEST_DATABASE_URL` | — | PostgreSQL URL for test DB; required to run API tests |
| `POSTGRES_USER` | — | PostgreSQL username (used by postgres Docker service) |
| `POSTGRES_PASSWORD` | — | PostgreSQL password |
| `POSTGRES_DB` | — | PostgreSQL database name |
| `SESSION_SECRET` | `"dev-secret"` | Session cookie signing |
| `NODE_ENV` | `development` | Enables secure cookie in production |
| `MEDIA_PATH` | `/media` | Uploaded media directory (mounted read-write in api + worker) |
| `ORIGINAL_QUALITY_MAX_BYTES` | `10485760` (10MB) | Max size for original-quality JPG/PNG uploads; also the media upload limit |
| `ORIGINAL_QUALITY_WINDOW_HOURS` | `24` | Hours a JPG/PNG is served losslessly before auto-downgrade to WebP |
| `AVATAR_PATH` | `/data/avatars` | Uploaded avatar directory (separate from media) |
| `RESEND_API_KEY` | — | Resend SMTP key (falls back to console log if unset) |
| `EMAIL_FROM` | — | Sender address (e.g. `"Вопли <noreply@vopley.net>"`) |
| `ANNOUNCEMENTS_SECRET` | — | Required to post announcements |
| `ADMIN_EMAIL` | — | Admin panel login |
| `ADMIN_PASSWORD_HASH` | — | BCrypt hash. Generate: `node -e "import('bcryptjs').then(b=>b.default.hash('YOUR_PASSWORD',12).then(console.log))"` |
| `ADMIN_COOKIE_SECRET` | — | AdminJS session cookie (min 32 chars, required in production) |
| `REDIS_HOST` | `redis` | Redis host (used for sessions + BullMQ) |
| `REDIS_PORT` | `6379` | Redis port |
| `WORKERS_PORT` | `3001` | Workers service port |
| `BULL_BOARD_BASE_PATH` | `/workers` | Bull Board UI path |

### Email domain whitelist (feature 007)

New emails may only enter the system if their domain is on a **static, in-code
allow-list**: `ALLOWED_EMAIL_DOMAINS` in `helpers/validation.js` (the single
source of truth — to change the permitted domains, edit that list and redeploy;
there is no env var). Enforced backend-first via `isAllowedEmailDomain()`,
called in `routes/auth.js` (`register/send-code`) and `routes/users.js`
(`email/send-code`) **before** any verification code is sent — so a disallowed
address never receives an email or creates a `VerificationCode`.

- **Allowed domains (18)**: `ya.ru`, `ukr.net`, `mail.ru`, `bk.ru`, `yandex.ru`,
  `yandex.com`, `rambler.ru`, `gmail.com`, `list.ru`, `inbox.ru`, `lenta.ru`,
  `icloud.com`, `outlook.com`, `hotmail.com`, `live.com`, `i.ua`, `meta.ua`,
  `yahoo.com`.
- **Matching**: case-insensitive, exact full-domain only — subdomains are not
  implied (`user@mail.gmail.com` and `user@gmail.com.evil.net` are rejected).
- **Gotcha**: the whitelist gates only emails *entering* the system
  (registration + email change). It never affects **login** of existing
  accounts — a user whose stored email is on a non-approved domain can still
  sign in. Rejection messages are Russian and deliberately do not disclose the
  list.

## Backend Code Conventions

- ES Modules (`"type": "module"`); `dotenv/config` only in `server.js`
- `app.js` exported; imported by `server.js` (prod) and test suite — no HTTP server or dotenv in tests
- Prisma for all DB access; Zod for input validation in `helpers/validation.js`
- Session auth (not JWT); sessions in Redis via `connect-redis`; test mode uses in-memory sessions; 30-day rolling sessions
- bcryptjs: 10 rounds (4 in tests for speed); all IDs via `crypto.randomUUID()`
- Rate limits: 20/min auth endpoints; 5/min forgot-password/send-code and email-change; 100/10min upload + shout-create (user falls back to IP)
- Sharp: auto-rotate, strip EXIF, generate WebP variants, atomic tmp→permanent move
- Animated GIFs: preserve `original.gif` + WebP thumbnail from first frame; `animated: true` in media DTO
- Original-Quality Uploads: JPG/PNG within the size limit also keep a lossless `original.<ext>` whose privacy metadata (EXIF/GPS/IPTC/XMP for JPEG; text/eXIf chunks for PNG) is stripped **losslessly** via a marker/chunk walk in `helpers/media.js` (`stripJpegMetadata`/`stripPngMetadata`) — NOT via Sharp (which re-encodes). `buildMedia()` serves `original.<ext>` as `full` (opened/lightbox view) while `media_meta.orig` is present and `converted !== true`, plus `orientation` so the stripped original renders upright; `thumb`/`url` (320/960 WebP) are unchanged, and `full` reverts to `1600.webp` after downgrade. Oversized (Russian message from `oversizedMessage()`) and corrupt uploads are rejected and store nothing (tmp dir discarded). A background sweep performs the 24h downgrade — see [Infrastructure](infra.md).
- Char limit: 400 effective chars; each newline costs 40 (`effectiveCharCount` helper)
- Edit window: 60s after creation (`EDIT_WINDOW_MS` in `helpers/validation.js`); enforced by backend timestamp check, mirrored on frontend with countdown
- Error responses: `{ error: "message" }`; graceful SIGTERM/SIGINT → Prisma disconnect
- Request logging: `[API] METHOD /path` to stdout (skipped in test mode)
- Unused vars prefixed `_`
- Shared helper functions belong in `helpers/` (e.g. `helpers/common.js`) — never duplicate a function across route or helper files; if it's needed in more than one place, extract it first

## Architecture Notes (Backend)

- `app.js` imported by both `server.js` (prod) and test suite — separation allows integration tests without starting HTTP server or loading dotenv.
- Soft-delete: `is_deleted=1` (user-deleted), `is_deleted=2` (banned-user content).
- `visibility_tag` (`""`, `"spoiler"`, `"nsfw"`, `"politics"`) — mutually exclusive. Spoiler/NSFW require media attached: backend strips tag if no media.
- **@mentions**: serialized as `@[username:userId]` tokens. Character counting normalizes `@[name:id]` → `@name` before limit check.
- Mention notifications to mentioned users; reply notifications to shout author (unless commenter = author, or already received mention for that comment).
- Media in `media` table, attached via the ordered `ShoutMedia`/`CommentMedia` join tables (feature 006) — never a direct FK column on `shouts`/`comments`. Up to 5 images form a gallery, or a single YouTube/GIF/video attachment; never mixed. See ShoutMedia/CommentMedia under Models above.
- **Polls**: 2–7 options (max 144 chars each), single or multi-select (`multi` flag). One-time voting (400 on re-vote). Constants: `POLL_MAX_OPTIONS = 7`, `POLL_OPTION_MAX_LENGTH = 144`.
- **Pinned shouts**: one at a time (`is_pinned=1`), fetched separately and prepended to first page of "new" tab only. Admin-managed.
- **Ignored users**: max 3; filtered client-side via `IgnoredUsersContext`; fetched on login.
- Registration: 6-digit email code, 10min expiry, max 5 attempts. `registration_open=false` blocks both register endpoints.
- Announcements: single-active-record — new POST soft-deletes all existing active ones.
- Image uploads: Sharp → multiple WebP sizes. EXIF stripped. GIFs: `original.gif` preserved, WebP thumbnail from first frame, `animated: true` flag + `gif` URL in media DTO.
- Nginx CSP: embeds from YouTube (nocookie), Coub, Tenor, Steam; images from YouTube thumbnails, DiceBear, Imgur, Tenor, `pbs.fxtwitter.com`, `cdn.akamai.steamstatic.com`; connect-src: `api.fxtwitter.com`, Steam store.
