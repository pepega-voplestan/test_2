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
│   └── socials.js          # Social links CRUD (12 platforms)
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
| GET | `/events` | — | SSE stream |
| GET | `/steam/app/:appId` | — | Steam store proxy (1h cache, avoids CORS) |
| POST | `/auth/register/send-code` | — | Send email code (rate: 20/min; blocked if `registration_open=false`) |
| POST | `/announcements` | Secret | Replace announcement (requires `ANNOUNCEMENTS_SECRET`; soft-deletes all previous) |
| GET | `/users/mentions` | — | All non-banned users for @mention autocomplete |
| GET | `/shouts` | — | `limit`, `offset`, `sortBy=new\|popular`, max 50 |
| POST | `/upload/media` | Yes | ≤5MB JPG/PNG/WebP/GIF; generates 320/960/1600px WebP |
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

**Targeted (`broadcastToUser`):**

| Event | Payload | Trigger |
|-------|---------|---------|
| `notification` | `{ id, type, actor, shoutId, commentId, isRead, timestamp, snippet }` | @mention or reply |

SSE real-time updates only apply to the `new` tab. Popular and announcements tabs load on demand.

## Notification System

**Types:** `mention` (user @mentioned in shout/comment), `reply` (comment on your shout, not already a mention).

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

### Models

**User** (`users`)
- `id` (UUID, PK), `username` (UNIQUE), `password_hash`, `avatar`, `email` (UNIQUE?), `is_banned` (0/1), `show_nsfw` (0/1), `show_politics` (0/1), `created_at`
- Relations: `receivedNotifications`, `sentNotifications`, `ignoredByMe`, `ignoredByOthers`, `socials`

**Shout** (`shouts`)
- `id` (UUID), `user_id`→users, `parent_id` (legacy, unused), `content`, `media_id`→media?, `visibility_tag` (""|spoiler|nsfw|politics), `is_pinned` (0/1), `is_deleted` (0/1/2), `created_at`
- Optional one-to-one `poll` relation
- Legacy columns (to remove): `media_type`, `media_url`, `media_meta`
- Indices: `(parent_id, created_at)`, `(created_at)`

**Comment** (`comments`)
- `id`, `shout_id`→shouts, `user_id`→users, `content`, `media_id`→media?, `is_deleted`, `created_at`
- Indices: `(shout_id, created_at)`, `(user_id)`

**Media** (`media`)
- `id`, `user_id`→users, `media_type` (image|youtube), `media_url` (relative path or video ID), `media_meta` (JSON: `{w, h, size, mime, animated}`), `created_at`

**ShoutLike** (`shout_likes`) — composite PK `(shout_id, user_id)`, cascade deletes

**CommentLike** (`comment_likes`) — composite PK `(comment_id, user_id)`, cascade deletes

**Announcement** (`announcements`)
- `id`, `content`, `is_deleted`, `created_at`
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
- `id`, `user_id`→users (CASCADE), `type` (steam|telegram|x|discord|battlenet|playstation|xbox|epicgames|youtube|spotify|boosty|retroachievements), `url`, `display_name` (default ""), `created_at`, `updated_at`
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
| `MEDIA_PATH` | `/media` | Uploaded media directory |
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

## Backend Code Conventions

- ES Modules (`"type": "module"`); `dotenv/config` only in `server.js`
- `app.js` exported; imported by `server.js` (prod) and test suite — no HTTP server or dotenv in tests
- Prisma for all DB access; Zod for input validation in `helpers/validation.js`
- Session auth (not JWT); sessions in Redis via `connect-redis`; test mode uses in-memory sessions; 30-day rolling sessions
- bcryptjs: 10 rounds (4 in tests for speed); all IDs via `crypto.randomUUID()`
- Rate limits: 20/min auth endpoints; 5/min forgot-password/send-code and email-change; 100/10min upload + shout-create (user falls back to IP)
- Sharp: auto-rotate, strip EXIF, generate WebP variants, atomic tmp→permanent move
- Animated GIFs: preserve `original.gif` + WebP thumbnail from first frame; `animated: true` in media DTO
- Char limit: 400 effective chars; each newline costs 40 (`effectiveCharCount` helper)
- Error responses: `{ error: "message" }`; graceful SIGTERM/SIGINT → Prisma disconnect
- Request logging: `[API] METHOD /path` to stdout (skipped in test mode)
- Unused vars prefixed `_`

## Architecture Notes (Backend)

- `app.js` imported by both `server.js` (prod) and test suite — separation allows integration tests without starting HTTP server or loading dotenv.
- Soft-delete: `is_deleted=1` (user-deleted), `is_deleted=2` (banned-user content).
- `visibility_tag` (`""`, `"spoiler"`, `"nsfw"`, `"politics"`) — mutually exclusive. Spoiler/NSFW require media attached: backend strips tag if no media.
- **@mentions**: serialized as `@[username:userId]` tokens. Character counting normalizes `@[name:id]` → `@name` before limit check.
- Mention notifications to mentioned users; reply notifications to shout author (unless commenter = author, or already received mention for that comment).
- Media in `media` table, referenced by `shouts.media_id` or `comments.media_id`. One attachment per shout/comment (image OR YouTube, not both).
- **Polls**: 2–7 options (max 144 chars each), single or multi-select (`multi` flag). One-time voting (400 on re-vote). Constants: `POLL_MAX_OPTIONS = 7`, `POLL_OPTION_MAX_LENGTH = 144`.
- **Pinned shouts**: one at a time (`is_pinned=1`), fetched separately and prepended to first page of "new" tab only. Admin-managed.
- **Ignored users**: max 3; filtered client-side via `IgnoredUsersContext`; fetched on login.
- Registration: 6-digit email code, 10min expiry, max 5 attempts. `registration_open=false` blocks both register endpoints.
- Announcements: single-active-record — new POST soft-deletes all existing active ones.
- Image uploads: Sharp → multiple WebP sizes. EXIF stripped. GIFs: `original.gif` preserved, WebP thumbnail from first frame, `animated: true` flag + `gif` URL in media DTO.
- Nginx CSP: embeds from YouTube (nocookie), Coub, Tenor, Steam; images from YouTube thumbnails, DiceBear, Imgur, Tenor, `pbs.fxtwitter.com`, `cdn.akamai.steamstatic.com`; connect-src: `api.fxtwitter.com`, Steam store.
