# CLAUDE.md

## Project Overview

Vopley.net — Twitter/X-style social media app. Users post short messages ("shouts"), comment, like, attach images/YouTube videos, manage profiles. UI in Russian.

**Stack**: React 18 + TypeScript + Vite / Node.js + Express + Prisma + SQLite / BullMQ + Redis / Docker + Nginx

## Repository Structure

```
.
├── api/                    # Backend (Express.js)
│   ├── src/
│   │   ├── server.js       # Entrypoint: dotenv, imports app.js, seeds settings
│   │   ├── app.js          # Express app factory: middleware, session, admin, swagger, routes
│   │   ├── admin.js        # AdminJS panel setup (users, shouts, comments, media, announcements, settings) + custom dashboard
│   │   ├── admin-dashboard.jsx # Custom AdminJS dashboard: analytics, timelines, top creators
│   │   ├── swagger.js      # OpenAPI 3.0.3 spec (dev only, blocked in prod)
│   │   ├── routes/
│   │   │   ├── index.js        # Mounts all routers via mountRoutes(app)
│   │   │   ├── auth.js         # Register, login, logout, password reset
│   │   │   ├── shouts.js       # Shout CRUD + replies + single fetch + poll creation
│   │   │   ├── comments.js     # Comment CRUD + reply/mention notifications
│   │   │   ├── likes.js        # Shout and comment like toggles
│   │   │   ├── users.js        # User profile + mentions autocomplete + email change
│   │   │   ├── upload.js       # Media and avatar upload
│   │   │   ├── announcements.js # Announcement read/write
│   │   │   ├── notifications.js # Notification fetch + mark-read
│   │   │   ├── ignored-users.js # Ignored users list, add, remove
│   │   │   ├── polls.js        # Poll voting
│   │   │   └── socials.js      # Social links CRUD (12 platforms)
│   │   ├── helpers/
│   │   │   ├── common.js       # asyncHandler, requireAuth, shared middleware
│   │   │   ├── feed.js         # enrichFeed: joins users/media/likes/polls onto rows
│   │   │   ├── media.js        # Sharp processing, GIF handling, avatar generation
│   │   │   ├── mentions.js     # extractMentionedUserIds, buildSnippet
│   │   │   ├── socials.js      # Platform validation, URL normalization, display extraction
│   │   │   └── validation.js   # Zod schemas shared across routes
│   │   ├── db.js           # Prisma client (WAL mode, foreign keys)
│   │   ├── auth.js         # Password hashing, session auth utilities
│   │   ├── email.js        # Email via nodemailer + Resend SMTP
│   │   └── sse.js          # SSE: client registry, broadcast, broadcastToUser, heartbeat
│   ├── prisma/schema.prisma, migrations/
│   ├── scripts/start.sh    # Docker entrypoint: prisma migrate deploy → start server
│   ├── tests/
│   │   ├── setup.js        # globalSetup: fresh SQLite DB, migrations, temp .env.test
│   │   ├── env.js          # setupFiles: loads .env.test into process.env
│   │   ├── helpers.js      # getApp(), request(), authenticatedAgent(), cleanDb(), disconnectDb()
│   │   ├── fixtures/index.js # createUser(), createShout(), createComment(), createPoll(), etc.
│   │   ├── unit/           # auth, admin, common, email, media, mentions, socials, sse, validation, app.setup
│   │   └── integration/    # health, auth, shouts, comments, likes, announcements, notifications,
│   │                       # feed, upload, users, polls, socials, index
│   ├── vitest.config.js    # node env, globalSetup, sequential files, coverage
│   ├── eslint.config.js    # @eslint/js recommended, Node globals, allows console, _-prefix unused vars
│   ├── package.json
│   └── Dockerfile          # Alpine Node 20, vips-dev + openssl; includes test build target
├── web/                    # Frontend (React + TypeScript)
│   ├── components/
│   │   ├── Header.tsx        # Auth, navigation, theme toggle, notification dropdown
│   │   ├── AuthModal.tsx     # Login/register/password-reset modal (multi-step, email verification)
│   │   ├── ShoutFeed.tsx     # Feed: new/popular/announcements tabs, SSE updates; popular has dual sort
│   │   ├── ShoutInput.tsx    # Composer: media, emoji, polls, drag-drop, Ctrl+Enter; spoiler/nsfw require media
│   │   ├── ShoutCard.tsx     # Shout display: comments, likes, delete; inline embeds (Twitter/X, Steam, Imgur, Coub, Tenor, Giphy, YouTube)
│   │   ├── ShoutPage.tsx     # Single shout detail view (#/shout/:id)
│   │   ├── MentionInput.tsx  # contenteditable composer with @mention autocomplete
│   │   ├── NotificationDropdown.tsx # Bell + unread badge + hover-to-read list + infinite scroll
│   │   ├── ProfilePage.tsx   # Profile view/edit + social links
│   │   ├── ProfileSocials.tsx # Social icons grid (copy-to-clipboard) + modal editor
│   │   ├── AvatarUpload.tsx  # Drag-drop avatar upload with preview
│   │   ├── EmojiPicker.tsx   # 500+ emojis, 13 categories, Russian+English search, sticky headers
│   │   ├── PollEditor.tsx    # Poll creation: 2-7 options, multi-select toggle, validation
│   │   ├── PollBlock.tsx     # Poll display/voting: progress bars, vote counts, optimistic updates
│   │   └── Lightbox.tsx      # Fullscreen image: drag-dismiss, pinch/scroll zoom, pan, scroll lock
│   ├── context/
│   │   ├── AuthContext.tsx, AuthContext.test.tsx
│   │   ├── ThemeContext.tsx, ThemeContext.test.tsx
│   │   ├── SSEContext.tsx                # Single shared EventSource; subscribe(event, handler) pattern
│   │   ├── NotificationsContext.tsx, NotificationsContext.test.tsx
│   │   ├── ContentPreferencesContext.tsx, ContentPreferencesContext.test.tsx
│   │   ├── IgnoredUsersContext.tsx, IgnoredUsersContext.test.tsx
│   ├── hooks/
│   │   ├── useRoute.ts, useRoute.test.ts           # Hash-based routing
│   │   ├── useSSE.ts, useSSE.test.ts               # Thin wrapper around SSEContext.subscribe
│   │   └── useMentionUsers.ts, useMentionUsers.test.ts # Module-level singleton cache for mention list
│   ├── tests/
│   │   ├── setup.ts          # DOM mocks (matchMedia, scrollTo)
│   │   ├── helpers.tsx       # renderWithProviders()
│   │   └── unit/effectiveLength.test.ts
│   ├── public/               # favicon.svg, steam.svg, xbox.svg, playstation.svg, epicgames.png, boosty.png, retroachievements.png, battlenet.webp
│   ├── App.tsx, index.tsx, types.ts, index.html
│   ├── vite.config.ts        # Dev proxy: /api and /media → localhost:3000
│   ├── vitest.config.ts      # jsdom env, @testing-library, 10s test / 15s hook timeout
│   ├── eslint.config.js
│   └── package.json, Dockerfile, .dockerignore
├── workers/                # BullMQ background jobs (TypeScript)
│   └── src/
│       ├── index.ts        # Starts workers, scheduler, Bull Board on port 3001
│       ├── db.ts, redis.ts, queues.ts, scheduler.ts
│       └── jobs/notification-cleanup.ts, jobs/db-backup.ts
├── infra/                  # Terraform (DigitalOcean): droplet, volume, firewall, DNS, cloud-init
├── scripts/backup.sh, restore.sh
├── .github/workflows/ci.yml, docker.yml
├── docker-compose.yml, docker-compose.dev.yml, docker-compose.local.yml, docker-compose.test.yml
├── nginx.conf, nginx-dev.conf, media-nginx.conf
└── Makefile, .env.example, README.md
```

## Core Principles (Non-Negotiables)

- **Session auth only** — never suggest JWT or localStorage for auth state
- **Russian UI** — all user-visible strings in Russian with correct declensions; never introduce English-language UI copy
- **Soft-delete everywhere** — `is_deleted=1` (user), `is_deleted=2` (banned); never hard-delete user content except notifications (14-day TTL)
- **Single media per post/comment** — image OR YouTube, not both; backend enforces, frontend must gate
- **Single-level comments** — no nested replies; `parent_id` on shouts is legacy/unused
- **Optimistic UI + rollback** — likes, deletes, poll votes update immediately, revert on error
- **One pinned shout max** — admin-managed; prepended only to "new" tab first page
- **Prisma for all DB access** — raw SQL only for migrations or extreme edge cases
- **Zod for all input validation** — schemas in `helpers/validation.js`, shared across routes

## Mobile & iOS — Known Issues and Rules

These apply to every new UI/UX element. iOS Safari has repeatedly caused regressions.

### Mandatory checks before shipping UI changes
- Test on real iOS Safari (not just Chrome DevTools mobile emulation — they differ significantly)
- Check with virtual keyboard open: `position: fixed` elements shift or get obscured; prefer `position: sticky` or restructure layout
- Check bottom safe area: use `padding-bottom: env(safe-area-inset-bottom)` on any bottom-anchored UI (modals, sticky bars)

### Known iOS Safari gotchas
- **`100vh` is broken** — use `100dvh` (dynamic viewport height) or `window.innerHeight` JS fallback for fullscreen modals/overlays
- **Input zoom** — `font-size < 16px` on `<input>`/`<textarea>` triggers auto-zoom on focus; minimum `16px` on all form inputs
- **`position: fixed` + virtual keyboard** — fixed elements don't stay fixed when keyboard opens; modals and the composer are affected
- **Scroll lock** — `overflow: hidden` on `<body>` doesn't prevent scroll on iOS; use `touch-action: none` or the existing Lightbox scroll-lock pattern
- **`:hover` states** — persist after tap on iOS (no hover-out event); gate hover-only styles with `@media (hover: hover)`
- **Pointer events** — always use pointer events (not separate mouse/touch handlers) for drag/swipe; Lightbox is the reference implementation
- **`-webkit-tap-highlight-color: transparent`** — set on interactive elements to remove the blue flash on tap
- **Backdrop blur** — `-webkit-backdrop-filter` needed alongside `backdrop-filter`

### Touch targets
- Minimum 44×44px tap target for all interactive elements (Apple HIG)
- Icon buttons without labels need explicit padding — don't rely on icon size alone

### Composer / ShoutInput on mobile
- Emoji picker positioning must account for virtual keyboard height
- Drag-drop for media doesn't exist on iOS; ensure tap-to-upload path is always present and obvious

## Key Reference Files

| Task | File(s) |
|------|---------|
| Add a new API route | `api/src/routes/index.js` (mount) + existing route as template |
| Add DB model / column | `api/prisma/schema.prisma` → `prisma migrate dev` |
| Add input validation schema | `api/src/helpers/validation.js` |
| Enrich feed with new joined data | `api/src/helpers/feed.js` — `enrichFeed()` |
| Add SSE broadcast event | `api/src/sse.js` (emit) + `web/context/SSEContext.tsx` (consume) |
| Add targeted SSE notification | `api/src/sse.js` — `broadcastToUser()` |
| Add a new social platform | `api/src/helpers/socials.js` + `web/components/ProfileSocials.tsx` |
| Add a new notification type | `api/src/routes/comments.js` or `shouts.js` + `web/context/NotificationsContext.tsx` |
| Add a new embed type | `web/components/ShoutCard.tsx` — `extractEmbeds()` |
| Add a new admin resource | `api/src/admin.js` |
| Add a new background job | `workers/src/jobs/` + register in `workers/src/index.ts` |
| Change char counting logic | `api/src/helpers/common.js` + `web/tests/unit/effectiveLength.test.ts` |
| Add a new context provider | Follow order in `web/App.tsx` (see provider order in Code Conventions) |

## Common Mistakes to Avoid

- **`visibility_tag` strip** — backend strips spoiler/nsfw if no `media_id`; frontend blocks selection too but is not the only guard; both must be in sync
- **SSEProvider order** — `SSEProvider` must be ancestor of `NotificationsProvider` and any `useSSE` consumer; wrong order = silent runtime errors
- **Admin panel fatality in prod** — any uncaught error in `admin.js` exits with code 1 in production; always test admin changes before deploying
- **`@mention` token format** — serialized as `@[username:userId]`, not plain `@username`; rendering, char counting, and notification extraction all depend on this exact format
- **Notification dedup** — reply notification suppressed if commenter already mentioned in the same comment; both cases in `routes/comments.js`; don't split this logic
- **Pinned shout** — setting a new pin via admin does NOT auto-unpin the previous; verify behavior when touching pin-related features
- **Test isolation** — tests run sequentially (SQLite write conflicts); never introduce `describe`-level parallelism or shared mutable state between test files
- **`bcrypt` rounds** — 10 in prod, 4 in tests; set via env in `tests/setup.js`; don't hardcode rounds in business logic
- **Rate limit fallback** — upload + shout-create rate limit falls back to IP if unauthenticated; test both auth states when touching these endpoints

## Quick Start

```sh
make install          # install all deps (root + api + web + workers) + husky hooks
cd web && npm run dev # starts API (port 3000) + Vite (port 5173) concurrently via concurrently
make prod             # Docker production (port 3005)
make local            # Docker local dev (port 3006, hot-reload, isolated volumes)
```

## Makefile Targets

Key targets (run `make` or `cat Makefile` for full list):

| Target | Description |
|--------|-------------|
| `make prod` / `make local` | Start production / local containers |
| `make deploy` / `make deploy-local` | Backup + rebuild + start |
| `make logs` / `make logs-local` | Follow logs |
| `make backup` / `make backup-upload` | Backup volumes / + rclone to Google Drive |
| `make restore` | Restore latest backup (or `TIMESTAMP=YYYYMMDD_HHMMSS`) |
| `make test` / `make test-web` / `make test-all` | Run API / web / both tests |
| `make db-pull` / `make db-pull-local` | Hot-copy SQLite DB to `./app.db` |

## API Endpoints

All prefixed `/api/v1/`. Auth = session cookie required. Full spec at `/api/docs` (dev only). Route files are the authoritative source.

Non-obvious / frequently referenced:

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

**Sections:**
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
- Read marking: 800ms hover queues item; batch sent on dropdown close or 5s safety flush via `PATCH /notifications/read-batch`. Dropdown list frozen while open (read-status changes don't reorder until reopened).
- **Browser tab indicator**: `(N) Вопли` title + Canvas API favicon red dot badge. Cleared when `unreadCount=0`.

**`NotificationsContext.tsx`** exposes: `sortedNotifications`, `unreadCount`, `hasMore`, `isLoadingMore`, `loadMore`, `markAsRead`, `markAllAsRead`, `flushReads`.

**`NotificationDropdown.tsx`**: bell icon + unread badge in Header; notifications as `<a>` elements (right-click open in new tab); actor avatar, text, snippet, relative timestamp; "mark all read" button; infinite scroll via `IntersectionObserver`.

## Database

SQLite + WAL mode + foreign keys. Managed via Prisma. `prisma migrate deploy` on Docker startup. For pre-Prisma DBs, P3005 error is detected and baseline resolved automatically. Sessions at `/data/sessions.sqlite`.

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
| `DATABASE_URL` | `file:/data/app.db` | Prisma SQLite path |
| `SESSION_SECRET` | `"dev-secret"` | Session cookie signing |
| `NODE_ENV` | `development` | Enables secure cookie in production |
| `MEDIA_PATH` | `/media` | Uploaded media directory |
| `RESEND_API_KEY` | — | Resend SMTP key (falls back to console log if unset) |
| `EMAIL_FROM` | — | Sender address (e.g. `"Вопли <noreply@vopley.net>"`) |
| `ANNOUNCEMENTS_SECRET` | — | Required to post announcements |
| `ADMIN_EMAIL` | — | Admin panel login |
| `ADMIN_PASSWORD_HASH` | — | BCrypt hash. Generate: `node -e "import('bcryptjs').then(b=>b.default.hash('YOUR_PASSWORD',12).then(console.log))"` |
| `ADMIN_COOKIE_SECRET` | — | AdminJS session cookie (min 32 chars, required in production) |
| `REDIS_HOST` | `redis` | BullMQ Redis host |
| `REDIS_PORT` | `6379` | BullMQ Redis port |
| `WORKERS_PORT` | `3001` | Workers service port |
| `BULL_BOARD_BASE_PATH` | `/workers` | Bull Board UI path |

## Testing

```sh
make test              # API unit + integration (cd api && npm test)
make test-web          # Web tests (cd web && npm test)
make test-all          # Both sequentially
make test-coverage     # API v8 coverage → api/coverage/
make test-web-coverage # Web v8 coverage → web/coverage/
make test-docker       # API in Docker (docker-compose.test.yml)
```

### API Tests (`api/tests/`)

Run sequentially (SQLite write conflict avoidance).

- `setup.js` — globalSetup: fresh SQLite DB at `tests/test.db`, migrations, temp `.env.test`
- `env.js` — setupFiles: loads `.env.test` into `process.env`
- `helpers.js` — `getApp()` (lazy import), `request()` (supertest), `authenticatedAgent(user)` (session cookie), `cleanDb()`, `disconnectDb()`
- `fixtures/index.js` — `createUser()`, `createShout()`, `createComment()`, `createPoll()`, `createPollVote()`, `createIgnoredUser()`, `createSocial()`. Users have `_rawPassword` for auth in tests.

**Mocked in tests:** `email.js` (no-op), `sse.js` (no-op, prevents heartbeat leak), `admin.js` (no-op, skips AdminJS init)

**Coverage:** v8, `src/**/*.js`, excludes `server.js`/`swagger.js`, reports to `api/coverage/`

### Web Tests (`web/`)

jsdom + @testing-library/react.

- `tests/helpers.tsx` — `renderWithProviders()` wraps all context providers
- Context tests (co-located): AuthContext, ThemeContext, NotificationsContext, ContentPreferencesContext, IgnoredUsersContext
- Hook tests (co-located): useRoute (hash routing), useSSE (reconnect, backoff 1s→30s), useMentionUsers (lazy load, module-level cache)
- Unit: `effectiveLength.test.ts` — char counting, mention normalization (`@[name:id]`→`@name`), spoiler stripping (`||…||`), newline cost (40 chars each)
- Coverage: `components/**`, `context/**`, `hooks/**`

### Git Hooks (Husky)

- **Pre-commit**: `npm run lint` for api and web
- **Pre-push**: `npm test` for api and web

### CI/CD

**CI** (`.github/workflows/ci.yml`): on PRs to main — install deps, generate Prisma client, lint both, test both.
**Deploy** (`.github/workflows/docker.yml`): manual `workflow_dispatch` — build + push images to GHCR, deploy via SSH.

### Linting

| Package | Config |
|---------|--------|
| `api/` | `@eslint/js` recommended; Node globals; `console.*` allowed; `_`-prefix unused vars |
| `web/` | `typescript-eslint` recommended; `react-hooks` rules; `no-explicit-any` = warn; `_`-prefix unused vars |

## Code Conventions

### Backend (api/)

- ES Modules (`"type": "module"`); `dotenv/config` only in `server.js`
- App defined in `app.js` (exported), imported by `server.js` (prod) and test suite — no HTTP server or dotenv in tests
- Prisma for all DB access (`prisma.user.findUnique(...)`, etc.); Zod for input validation in `helpers/validation.js`
- Session auth (not JWT); sessions in SQLite via `connect-sqlite3`; test mode uses in-memory sessions; 30-day rolling sessions
- bcryptjs: 10 rounds (4 in tests for speed); all IDs via `crypto.randomUUID()`
- Rate limits: 20/min auth endpoints; 5/min forgot-password/send-code and email-change; 100/10min upload + shout-create (user falls back to IP)
- Sharp: auto-rotate, strip EXIF, generate WebP variants, atomic tmp→permanent move
- Animated GIFs: preserve `original.gif` + WebP thumbnail from first frame; `animated: true` in media DTO
- Char limit: 400 effective chars; each newline costs 40 (`effectiveCharCount` helper)
- Error responses: `{ error: "message" }`; graceful SIGTERM/SIGINT → Prisma disconnect
- Request logging: `[API] METHOD /path` to stdout (skipped in test mode)
- Unused vars prefixed `_`

### Frontend (web/)

- Functional components, TypeScript strict; source directly under `web/` (no `src/` subdirectory)
- Context hooks: `useAuth()`, `useTheme()`, `useSSEContext()` / `useSSE(listeners)`, `useNotifications()`, `useContentPreferences()`, `useIgnoredUsers()`
- `useIgnoredUsers()` provides: `ignoredUserIds`, `isIgnored()`, `addIgnoredUser()`, `removeIgnoredUser()`
- Auth flow: 2-step registration (send code → verify); password reset (send code → verify → new password)
- Hash routing via `useRoute.ts`: `#/` (feed), `#/profile/:id`, `#/shout/:id`
- Tailwind via CDN; theme tokens `th-*` classes backed by CSS vars `--th-*`; dark mode via `.dark` on `<html>`
- Fetch with `credentials: "include"`; optimistic UI (likes, delete) with rollback on error
- PascalCase components, camelCase functions/variables; all UI text in Russian with proper declensions
- Context provider order (outermost first): `ThemeProvider → AuthProvider → SSEProvider → ContentPreferencesProvider → IgnoredUsersProvider → NotificationsProvider`
- `SSEProvider` must wrap `NotificationsProvider` and any component using `useSSE`/`useSSEContext`
- Unused vars prefixed `_`

## Architecture Notes

- `app.js` imported by both `server.js` (prod) and test suite — separation allows integration tests without starting HTTP server or loading dotenv.
- SPA with hash routing — no server-side route handling needed.
- Comments in separate `comments` table (not as shouts) — single level of threading, no deep nesting.
- Soft-delete: `is_deleted=1` (user-deleted), `is_deleted=2` (banned-user content).
- `visibility_tag` (`""`, `"spoiler"`, `"nsfw"`, `"politics"`) — mutually exclusive. Spoiler/NSFW require media attached: backend strips tag if no media; frontend blocks selection without media in ShoutInput.
- **@mentions**: serialized as `@[username:userId]` tokens. `MentionInput.tsx` = contenteditable div, `@` opens dropdown of up to 5 matching users (client-side filtered from module-level cached list). `renderContent` in ShoutCard parses tokens → `#/profile/:id` links. Character counting normalizes `@[name:id]` → `@name` before limit check. User list lazy-fetched on first `@` via `GET /users/mentions`, cached for browser session.
- Mention notifications to mentioned users; reply notifications to shout author (unless commenter = author, or already received mention for that comment). Both handled in routes using `helpers/mentions.js`.
- Media in `media` table, referenced by `shouts.media_id` or `comments.media_id`. One attachment per shout/comment (image OR YouTube, not both).
- **Embeds** (`extractEmbeds()` in ShoutCard): auto-detects URLs and renders inline. Platforms: **YouTube** (iframe, oEmbed, 5s timeout), **Twitter/X** (fxtwitter API, module-level `tweetCache`, shows author/text/photos/stats; image proxy via `pbs.fxtwitter.com`), **Steam** (server-side proxy `/steam/app/:appId`, module-level `steamCache`, shows name/description/price/recommendations in Russian), **Imgur** (direct images + pages + albums), **Coub** (iframe), **Tenor** (iframe), **Giphy** (iframe, multiple URL patterns). Rendered in URL order found in text.
- **Polls**: 2–7 options (max 144 chars each), single or multi-select (`multi` flag). One-time voting (400 on re-vote). Optimistic frontend updates. SSE `poll_update` for real-time counts. Constants: `POLL_MAX_OPTIONS = 7`, `POLL_OPTION_MAX_LENGTH = 144`.
- **Pinned shouts**: one at a time (`is_pinned=1`), fetched separately and prepended to first page of "new" tab only (not popular tab). Admin-managed.
- **Ignored users**: max 3; filtered client-side via `IgnoredUsersContext`; fetched on login.
- **Social links**: 12 platforms, one per platform per user. URLs validated + normalized per platform, display names extracted (some async via external APIs: Steam, YouTube, Spotify). Non-URL socials (Discord, Battle.net, PSN, Xbox, Epic Games) support copy-to-clipboard.
- Content hidden by preferences: placeholder div (crossed-camera icon) rendered instead of removing from DOM — prevents layout jumps.
- Popular tab: shouts from last 7 days; dual sort buttons (heart = likes, comment icon = comments) via `popularSort` state in ShoutFeed.
- Registration: 6-digit email code, 10min expiry, max 5 attempts. `registration_open=false` in Settings blocks both register endpoints.
- Announcements: single-active-record — new POST soft-deletes all existing active ones.
- Image uploads: Sharp → multiple WebP sizes. EXIF stripped. GIFs: `original.gif` preserved, WebP thumbnail from first frame, `animated: true` flag + `gif` URL in media DTO.
- Lightbox: drag-to-dismiss (vertical swipe + velocity), Escape, click-outside, scroll lock. Pointer events (unified mouse/touch). Pinch-to-zoom, scroll-to-zoom, pan when zoomed, double-tap/click to toggle zoom.
- Nginx CSP: embeds from YouTube (nocookie), Coub, Tenor, Steam; images from YouTube thumbnails, DiceBear, Imgur, Tenor, `pbs.fxtwitter.com`, `cdn.akamai.steamstatic.com`; connect-src: `api.fxtwitter.com`, Steam store.

## Background Jobs (Workers)

TypeScript + BullMQ + Redis. Separate Docker container, shares SQLite volume with API. Bull Board dashboard at `/workers` (nginx-proxied, HTTP basic auth).

| Job | Schedule | Action |
|-----|----------|--------|
| `notification-cleanup` | 00:00 UTC daily | Hard-delete notifications older than 14 days |
| `db-backup` | 02:00 UTC daily | `VACUUM INTO` atomic backup, keep last 7 |

Jobs registered idempotently via `upsertJobScheduler` (safe on restart). Dev container uses `tsx watch` with source mount for hot-reload.

## Backup & Restore

```sh
./scripts/backup.sh prod           # timestamped tarballs in ./backups/
./scripts/backup.sh prod --upload  # + rclone to Google Drive
./scripts/restore.sh prod          # latest (prompts for confirmation, stops containers)
./scripts/restore.sh prod TIMESTAMP
```

Keeps last 3 snapshots (configurable via `KEEP` in script). DB backed up via `sqlite3 .backup` (hot, atomic, no downtime).

## Docker Services

6 services per environment. Prod port 3005, local port 3006. Dev volumes isolated (`-dev` suffix on all volume names).

| Service | Description |
|---------|-------------|
| `api` | Express backend (internal port 3000); runs `prisma migrate deploy` on startup |
| `media` | Hardened Nginx: WebP/JPG/JPEG/PNG/GIF/MP4 only, no dotfiles, immutable 1yr cache |
| `nginx` | Reverse proxy: `/api/*`→api, `/media/*`→media, `/admin`+`/workers` with HTTP basic auth, SPA fallback. SSE: buffering off, 24h timeout. Prod blocks `/api/docs`. |
| `web-build` | One-shot React build → `webdist` shared volume |
| `redis` | Redis 7 Alpine; snapshot every 60s if ≥1 key changed |
| `worker` | BullMQ jobs + Bull Board on port 3001; dev uses `tsx watch` |

**Four compose files:**
- `docker-compose.yml` — production (port 3005)
- `docker-compose.dev.yml` — dev droplet (pre-built GHCR images, managed by CI)
- `docker-compose.local.yml` — local dev (hot-reload, bind mounts, port 3006, isolated volumes)
- `docker-compose.test.yml` — single `api-test` service with tmpfs DB, exits with vitest coverage code

## Known Tech Debt

- **Mobile/iOS** — no systematic mobile QA; iOS Safari regressions are common (see Mobile section above); no dedicated mobile testing in CI
- No Prettier / auto-formatter (ESLint active, no style enforcement)
- No React error boundaries
- Tailwind loaded via CDN (not bundled)
- Legacy inline media columns on `shouts` table (`media_type`, `media_url`, `media_meta`) — to be removed
- Planned notification types `shout_like`/`comment_like` not yet implemented
- `components/` directory has no test files (contexts + hooks are covered)
- `workers/` has no test suite
