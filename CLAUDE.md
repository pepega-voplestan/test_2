# CLAUDE.md

## Project Overview

This is **Kanobu Shouts Clone** (branded "Вопли") — a Twitter/X-style social media web application where users post short messages ("shouts"), comment on them, like content, attach images or YouTube videos, and manage user profiles. The UI is entirely in Russian.

**Stack**: React 18 + TypeScript + Vite (frontend) / Node.js + Express + Prisma + SQLite (backend) / Docker + Nginx (deployment)

## Repository Structure

```
.
├── api/                    # Backend (Express.js)
│   ├── src/
│   │   ├── server.js       # Entry point: dotenv, imports app.js, seeds settings, notification cleanup
│   │   ├── app.js          # Express app factory: middleware, session, admin, swagger, routes (imported by server.js and tests)
│   │   ├── admin.js        # AdminJS panel setup (users, shouts, comments, media, announcements, settings)
│   │   ├── swagger.js      # OpenAPI 3.0.3 spec for Swagger UI (dev only, blocked in prod)
│   │   ├── routes/         # Domain-split route handlers
│   │   │   ├── index.js        # Mounts all domain routers via mountRoutes(app)
│   │   │   ├── auth.js         # Auth routes (register, login, logout, password reset)
│   │   │   ├── shouts.js       # Shout CRUD + replies + single shout fetch
│   │   │   ├── comments.js     # Comment CRUD + reply/mention notifications
│   │   │   ├── likes.js        # Shout and comment like toggles
│   │   │   ├── users.js        # User profile + mentions autocomplete
│   │   │   ├── upload.js       # Media and avatar upload
│   │   │   ├── announcements.js # Announcement read/write
│   │   │   └── notifications.js # Notification fetch + mark-read endpoints
│   │   ├── helpers/        # Shared utilities
│   │   │   ├── common.js       # asyncHandler, requireAuth, and other shared middleware
│   │   │   ├── feed.js         # enrichFeed: joins users/media/likes onto shout/comment rows
│   │   │   ├── media.js        # Sharp image processing, GIF handling, avatar generation
│   │   │   ├── mentions.js     # extractMentionedUserIds, buildSnippet for notification system
│   │   │   └── validation.js   # Zod schemas shared across routes
│   │   ├── db.js           # Prisma client init (WAL mode, foreign keys)
│   │   ├── auth.js         # Password hashing, session auth utilities
│   │   ├── email.js        # Email sending via nodemailer + Resend SMTP
│   │   └── sse.js          # Server-Sent Events: client registry, broadcast, heartbeat
│   ├── prisma/
│   │   ├── schema.prisma   # Prisma schema (all models)
│   │   └── migrations/     # Prisma migration files
│   ├── scripts/
│   │   └── start.sh        # Docker entrypoint: runs prisma migrate deploy, then starts server
│   ├── tests/
│   │   ├── setup.js        # Vitest globalSetup: creates test DB, runs migrations, cleanup
│   │   ├── env.js          # Vitest setupFiles: loads env vars written by globalSetup
│   │   ├── helpers.js      # Shared test utilities (request, authenticatedAgent, cleanDb, disconnectDb)
│   │   ├── fixtures/
│   │   │   └── index.js    # Test data factories (createUser, createShout, createComment, etc.)
│   │   ├── unit/           # Unit tests (auth, admin, common, email, media, mentions, sse, validation, app.setup)
│   │   └── integration/    # Integration tests (health, auth, shouts, comments, likes, announcements,
│   │                       #   notifications, feed, upload, users, index)
│   ├── vitest.config.js    # Vitest config: node env, globalSetup, sequential files, coverage
│   ├── eslint.config.js    # ESLint flat config: @eslint/js recommended, Node globals, allows console, _-prefix unused vars
│   ├── package.json
│   ├── Dockerfile          # Alpine Node 20, installs vips-dev + openssl; includes test build target
│   └── .dockerignore
├── web/                    # Frontend (React + TypeScript)
│   ├── components/
│   │   ├── Header.tsx        # App header with auth, navigation, theme toggle, notification dropdown
│   │   ├── AuthModal.tsx     # Login/register/password-reset modal (multi-step with email verification)
│   │   ├── ShoutFeed.tsx     # Main feed with tabs (new/popular/announcements), SSE updates; popular tab has dual sort buttons (likes/comments)
│   │   ├── ShoutInput.tsx    # Shout composer with media, emoji, drag-drop, clipboard paste; Ctrl+Enter/Cmd+Enter to submit; spoiler/nsfw tags require media
│   │   ├── ShoutCard.tsx     # Individual shout with comments, likes, delete
│   │   ├── ShoutPage.tsx     # Single shout detail view (route: #/shout/:id)
│   │   ├── MentionInput.tsx  # contenteditable composer with @mention autocomplete (replaces textarea in ShoutInput/ShoutCard)
│   │   ├── NotificationDropdown.tsx # Bell icon + unread badge + hover-to-read notification list
│   │   ├── ProfilePage.tsx   # User profile view and edit form
│   │   ├── AvatarUpload.tsx  # Drag-drop avatar upload with preview
│   │   ├── EmojiPicker.tsx   # Emoji picker with grouped categories
│   │   └── Lightbox.tsx      # Fullscreen image viewer with drag-to-dismiss, pinch/scroll-to-zoom, pan when zoomed, scroll lock
│   ├── context/
│   │   ├── AuthContext.tsx               # Auth state via React Context + API helper
│   │   ├── AuthContext.test.tsx          # Tests: login/logout, registration, password reset, modal state
│   │   ├── ThemeContext.tsx              # Dark/light theme toggle with localStorage persistence
│   │   ├── ThemeContext.test.tsx         # Tests: theme toggling and localStorage persistence
│   │   ├── NotificationsContext.tsx      # Notification state, batched read marking, SSE subscription
│   │   ├── NotificationsContext.test.tsx # Tests: SSE events, batching, mark-as-read, cleanup
│   │   ├── ContentPreferencesContext.tsx # Content visibility prefs (showMedia, showNsfw, showPolitics)
│   │   └── ContentPreferencesContext.test.tsx # Tests: preference toggles
│   ├── hooks/
│   │   ├── useRoute.ts           # Hash-based client-side routing
│   │   ├── useRoute.test.ts      # Unit tests for hash-based routing hook
│   │   ├── useSSE.ts             # SSE client hook with auto-reconnect + exponential backoff
│   │   ├── useSSE.test.ts        # Tests: reconnect logic, backoff (1s → 30s cap)
│   │   ├── useMentionUsers.ts    # Module-level singleton cache for mention user list (lazy-loaded on first @)
│   │   └── useMentionUsers.test.ts # Tests: lazy loading and module-level caching
│   ├── tests/
│   │   ├── setup.ts          # Vitest/DOM setup (mocks: matchMedia, scrollTo)
│   │   ├── helpers.tsx       # renderWithProviders helper for tests needing context providers
│   │   └── unit/
│   │       └── effectiveLength.test.ts # Tests: char counting, mention normalization, spoiler stripping, newline cost
│   ├── public/
│   │   └── favicon.svg       # SVG favicon (Cyrillic "В" on dark rounded square)
│   ├── App.tsx               # Root component with routing, ThemeProvider + AuthProvider + NotificationsProvider
│   ├── index.tsx             # React entry point (StrictMode)
│   ├── types.ts              # TypeScript type definitions (includes Notification interface)
│   ├── index.html            # HTML template (Tailwind CDN, CSS custom properties for theming)
│   ├── tsconfig.json
│   ├── vite.config.ts        # Dev proxy: /api and /media → localhost:3000
│   ├── vitest.config.ts      # Vitest config: merges vite config, jsdom env, @testing-library setup; 10s test/15s hook timeout
│   ├── eslint.config.js      # ESLint flat config: TS ESLint recommended, react-hooks rules, _-prefix unused vars
│   ├── package.json
│   ├── Dockerfile
│   └── .dockerignore
├── scripts/
│   ├── backup.sh             # Backup Docker volumes (DB + media) with rotation, optional rclone upload
│   └── restore.sh            # Restore Docker volumes from a timestamped backup
├── .github/
│   └── workflows/
│       └── ci.yml            # CI: lints then tests API + web on pull requests to main
├── .husky/
│   ├── pre-commit            # Git hook: runs npm run lint for api and web before every commit
│   └── pre-push              # Git hook: runs npm test for api and web before every push
├── docker-compose.yml        # Production: 4 services on port 3005
├── docker-compose.dev.yml    # Development: 4 services on port 3006 (isolated volumes)
├── docker-compose.test.yml   # Test: single api-test service with tmpfs DB, runs vitest --coverage
├── nginx.conf                # Production reverse proxy (blocks /api/docs, proxies /admin with HTTP basic auth)
├── nginx-dev.conf            # Development reverse proxy (allows /api/docs for Swagger UI, proxies /admin)
├── media-nginx.conf          # Security-hardened media file server (webp/jpg/jpeg/png/gif)
├── Makefile                  # Shortcuts for docker-compose + backup/restore + test commands
├── package.json              # Workspace root: husky setup only
├── .env                      # Production environment variables (gitignored)
├── .env.dev                  # Development environment variables (gitignored)
├── .env.example              # Template with placeholder values
├── RELEASE_NOTES_2026-02-18.md # Release notes for the Prisma migration release
└── README.md
```

## Quick Start

### Prerequisites

- Node.js (v18+)
- npm

### Install Dependencies

```sh
# Install all dependencies and set up git hooks (recommended)
make install

# Or manually:
npm install          # root (husky hooks)
cd api && npm install
cd ../web && npm install
```

### Run in Development

```sh
cd web && npm run dev
```

This uses `concurrently` to start both the backend API (`node src/server.js` on port 3000) and the Vite dev server (port 5173). In dev mode the API also serves `/media` as static files. The API auto-loads `.env` via `dotenv/config`.

### Run with Docker

```sh
# Production (port 3005)
make prod

# Development (port 3006, isolated volumes)
make dev
```

### Makefile Targets

| Target | Description |
|--------|-------------|
| `make prod` | Start production containers |
| `make dev` | Start development containers (uses `.env.dev`) |
| `make down` | Stop production containers |
| `make down-dev` | Stop development containers |
| `make logs` | Follow production logs |
| `make logs-dev` | Follow development logs |
| `make rebuild` | Force rebuild production (no cache) |
| `make rebuild-dev` | Force rebuild development (no cache) |
| `make backup` | Backup production volumes (DB + media) |
| `make backup-upload` | Backup production + upload to Google Drive via rclone |
| `make backup-dev` | Backup development volumes |
| `make restore` | Restore production volumes (latest or `TIMESTAMP=YYYYMMDD_HHMMSS`) |
| `make restore-dev` | Restore development volumes |
| `make deploy` | Backup, rebuild, and start production (safe redeploy) |
| `make deploy-dev` | Backup, rebuild, and start development |
| `make test` | Run API tests locally (`cd api && npm test`) |
| `make test-web` | Run web tests locally (`cd web && npm test`) |
| `make test-all` | Run both API and web tests sequentially |
| `make test-docker` | Run API tests in Docker using `docker-compose.test.yml` |
| `make test-coverage` | Run API tests with v8 coverage report |
| `make test-web-coverage` | Run web tests with v8 coverage report |
| `make install` | Install all dependencies (root + api + web) and set up git hooks |
| `make ensure-htpasswd` | Validate that `.htpasswd` exists (required for admin panel nginx auth) |

## API Endpoints

All endpoints are prefixed with `/api/v1/`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Health check — `{ ok: true }` |
| GET | `/me` | No | Get current user session |
| GET | `/events` | No | SSE stream — real-time feed events |
| POST | `/auth/register/send-code` | No | Step 1: validate inputs, send email verification code (rate limited 20/min). Blocked if `registration_open` setting is `"false"`. |
| POST | `/auth/register/verify` | No | Step 2: verify code, create account, auto-login (rate limited 20/min). Blocked if `registration_open` setting is `"false"`. |
| POST | `/auth/login` | No | Login with username or email (rate limited 20/min) |
| POST | `/auth/logout` | Yes | Logout, destroy session |
| POST | `/auth/forgot-password/send-code` | No | Send password reset code (rate limited 5/min) |
| POST | `/auth/forgot-password/reset` | No | Verify code + set new password, auto-login (rate limited 20/min) |
| GET | `/shouts?limit=&offset=&sortBy=` | No | List shouts with pagination (max 50). `sortBy=new\|popular` |
| GET | `/shouts/:id` | No | Get a single shout by ID (used by ShoutPage) |
| POST | `/shouts` | Yes | Create a shout (text, mediaId, or youtubeUrl) |
| DELETE | `/shouts/:id` | Yes | Soft-delete own shout |
| POST | `/shouts/:id/replies` | Yes | Add a comment to a shout |
| POST | `/shouts/:id/like` | Yes | Toggle like, returns new count |
| DELETE | `/comments/:id` | Yes | Soft-delete own comment |
| POST | `/comments/:id/like` | Yes | Toggle like on a comment |
| GET | `/announcements` | No | Get the current active announcement (or `null`) |
| POST | `/announcements` | Secret key | Replace current announcement; requires `secret_key` matching `ANNOUNCEMENTS_SECRET` |
| GET | `/users/mentions` | No | List all non-banned users for mention autocomplete (`{ users: [{ id, name, avatar }] }`) |
| GET | `/users/:id` | No | Get user profile (email visible to owner only) |
| GET | `/users/:id/shouts` | No | Paginated list of a user's shouts |
| PUT | `/users/:id` | Yes | Update profile (username, email, avatar, password) |
| POST | `/upload/media` | Yes | Upload image/GIF (≤5MB JPG/PNG/WebP/GIF; generates 320/960/1600px WebP variants; GIFs also store original) |
| POST | `/upload/avatar` | Yes | Upload avatar (≤2MB JPG/PNG/WebP; generates 64/128/256px square WebP) |
| GET | `/avatars/:userId/:size.webp` | No | Serve avatar with immutable cache headers |
| GET | `/notifications` | Yes | Fetch unread notifications from the past 7 days |
| PATCH | `/notifications/read-batch` | Yes | Mark a batch of notifications as read (max 50 at once) |
| PATCH | `/notifications/read-all` | Yes | Mark all unread notifications as read |

## Admin Panel

The app ships an **AdminJS**-powered admin panel at `/admin`, protected by two layers of authentication:

1. **HTTP Basic Auth** (Nginx layer) — requires a `.htpasswd` file mounted into the nginx container. Generate with:
   ```sh
   docker run --rm httpd:alpine htpasswd -nbB admin_username YOUR_PASSWORD > .htpasswd
   ```
2. **AdminJS login form** — email + bcrypt password hash from env vars (`ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`)

**Admin panel sections:**

| Section | Capabilities |
|---------|-------------|
| Пользователи (Users) | View, edit, ban/unban (ban sets `is_deleted=2` on their content); links to user's shouts/comments/media |
| Вопли (Shouts) | View, soft-delete, restore soft-deleted shouts |
| Комменты (Comments) | View, soft-delete, restore soft-deleted comments |
| Медиа (Media) | Read-only view of uploaded media |
| Объявления (Announcements) | Create announcements (auto-soft-deletes previous), soft-delete existing |
| Настройки (Settings) | Edit key-value settings (e.g. `registration_open`) |

**Setup** (`api/src/app.js`): AdminJS is initialized on startup (skipped in test mode). If setup fails in dev mode, the server continues without the admin panel. In production, failure is fatal (exits with code 1).

**Registration gating**: The `registration_open` setting (default `"true"`) is checked on both registration endpoints. Set to `"false"` via the admin panel to disable new account creation.

## API Documentation (Swagger UI)

The API has an interactive OpenAPI 3.0.3 documentation UI powered by `swagger-ui-express`. The spec is defined in `api/src/swagger.js` and includes schemas for all DTOs (`ShoutDto`, `CommentDto`, `MediaDto`, `Profile`, `Announcement`, etc.).

- **Development**: accessible at `/api/docs` (served by Express when `NODE_ENV !== "production"`)
- **Production**: blocked by nginx (`location /api/docs { return 404; }`)

The Swagger spec covers all endpoints and their request/response schemas, making it useful as a quick reference during development.

## SSE Real-Time Events

The `/api/v1/events` endpoint streams Server-Sent Events to all connected clients. The backend broadcasts on all write operations. The frontend subscribes via `useSSE` hook in `ShoutFeed`.

**Events emitted (broadcast to all clients):**

| Event | Payload | Trigger |
|-------|---------|---------|
| `new_shout` | Shout object | Shout created |
| `delete_shout` | `{ id }` | Shout soft-deleted |
| `new_comment` | Comment object | Comment added |
| `delete_comment` | `{ id, shoutId }` | Comment soft-deleted |
| `shout_like` | `{ id, likes }` | Shout like toggled |
| `comment_like` | `{ id, likes }` | Comment like toggled |

**Events emitted (targeted delivery via `broadcastToUser`):**

| Event | Payload | Trigger |
|-------|---------|---------|
| `notification` | `{ id, type, actor, shoutId, commentId, isRead, timestamp, snippet }` | @mention or reply to a shout the user authored |

The SSE module (`api/src/sse.js`) exports both `broadcast(event, data)` (all clients) and `broadcastToUser(userId, event, data)` (targeted). A heartbeat ping is sent every 30 seconds to keep connections alive through proxies. The `useSSE` hook reconnects with exponential backoff (1s → 30s max) on error.

`NotificationsContext.tsx` maintains its own SSE connection to receive `notification` events in real-time and appends them to the client-side notification list.

**Important**: SSE real-time updates only apply to the `new` (newest) tab. The `popular` and `announcements` tabs load on demand and do not react to live events.

## Notification System

Notifications are triggered server-side and delivered in real-time via targeted SSE, with persistence in the database.

**Notification types:**

| Type | Trigger |
|------|---------|
| `mention` | A user is @mentioned in a shout or comment |
| `reply` | A comment is posted on a user's shout (if the commenter is not the shout author, and not already covered by a mention notification) |

**Lifecycle:**
- Created in `routes/shouts.js` (for mention notifications in new shouts) and `routes/comments.js` (for mention and reply notifications).
- `helpers/mentions.js` provides `extractMentionedUserIds(content, actorId)` to parse `@[username:userId]` tokens and `buildSnippet(content, maxLen=60)` to generate truncated previews for notification text. Snippets apply spoiler-awareness: inline spoiler markers (`||…||`) are replaced with asterisks masking only the hidden part; shouts tagged `politics` replace the entire snippet with "ПОЛИТИКА"; `spoiler`/`nsfw` tags replace it with "СПОЙЛЕР".
- Self-mentions are excluded — the actor never receives their own notification.
- Server-side cleanup: `server.js` runs a task every 24 hours that hard-deletes notifications older than 14 days.
- Frontend: `NotificationsContext.tsx` fetches unread notifications on login (past 7 days only), listens for real-time `notification` SSE events, and batches mark-as-read requests.
- Read marking: hovering a notification item for 800ms queues it for batch-read. When the dropdown closes (or after a 5-second safety flush), the batch is sent via `PATCH /notifications/read-batch`.

**Frontend components:**
- `NotificationsContext.tsx` — state management, SSE subscription, batched read marking logic
- `NotificationDropdown.tsx` — bell icon with unread badge in `Header.tsx`; dropdown lists notifications with actor avatar, text, snippet, and relative timestamp; "mark all read" button; clicking a notification navigates to the associated shout

## Database

SQLite with WAL mode and foreign keys enabled. Managed via **Prisma ORM** — schema defined in `api/prisma/schema.prisma`, migrations in `api/prisma/migrations/`.

On Docker startup, `scripts/start.sh` runs `prisma migrate deploy`. For existing pre-Prisma databases, it detects the P3005 error and resolves the baseline migration automatically.

### Models

**User** (`users`)
- `id` (String, UUID, PK)
- `username` (String, UNIQUE)
- `password_hash` (String)
- `avatar` (String)
- `email` (String?, UNIQUE)
- `is_banned` (Int, default 0)
- `show_nsfw` (Int, default 0) — user preference to show NSFW-tagged shouts
- `show_politics` (Int, default 0) — user preference to show politics-tagged shouts
- `created_at` (String, ISO datetime)
- Relations: `receivedNotifications`, `sentNotifications`

**Shout** (`shouts`)
- `id` (String, UUID, PK)
- `user_id` (String, FK → users)
- `parent_id` (String?, FK → shouts, legacy)
- `content` (String)
- `media_id` (String?, FK → media)
- `visibility_tag` (String, default `""`) — content flag: `""`, `"spoiler"`, `"nsfw"`, or `"politics"` (mutually exclusive)
- `is_deleted` (Int, default 0, soft-delete; `2` = banned-user content)
- `created_at` (String, ISO datetime)
- Legacy inline columns: `media_type`, `media_url`, `media_meta` (retained for baseline, to be removed)
- Indices: `(parent_id, created_at)`, `(created_at)`

**Comment** (`comments`)
- `id` (String, UUID, PK)
- `shout_id` (String, FK → shouts)
- `user_id` (String, FK → users)
- `content` (String)
- `media_id` (String?, FK → media)
- `is_deleted` (Int, default 0, soft-delete)
- `created_at` (String, ISO datetime)
- Indices: `(shout_id, created_at)`, `(user_id)`

**Media** (`media`)
- `id` (String, UUID, PK)
- `user_id` (String, FK → users)
- `media_type` (String): `"image"` or `"youtube"`
- `media_url` (String): relative path for images, video ID for YouTube
- `media_meta` (String?): JSON blob with `w`, `h`, `size`, `mime`, `animated` (bool)
- `created_at` (String, ISO datetime)

**ShoutLike** (`shout_likes`)
- Composite PK: `(shout_id, user_id)`
- Cascading deletes

**CommentLike** (`comment_likes`)
- Composite PK: `(comment_id, user_id)`
- Cascading deletes

**Announcement** (`announcements`)
- `id` (String, UUID, PK)
- `content` (String)
- `is_deleted` (Int, default 0, soft-delete)
- `created_at` (String, ISO datetime)
- Index: `(is_deleted, created_at)`
- Only the latest non-deleted announcement is displayed. Posting a new one soft-deletes all previous ones.

**VerificationCode** (`verification_codes`)
- `id` (String, UUID, PK)
- `email`, `code`, `purpose` (`"register"` or `"reset"`), `payload` (JSON?), `expires_at`, `used`, `attempts`, `created_at`
- Index: `(email, purpose, used)`

**Notification** (`notifications`)
- `id` (String, UUID, PK)
- `user_id` (String, FK → users, CASCADE) — recipient
- `actor_id` (String, FK → users, CASCADE) — who triggered it
- `type` (String): `"mention"` or `"reply"`
- `shout_id` (String?, FK → shouts, SET NULL on delete)
- `comment_id` (String?, FK → comments, SET NULL on delete)
- `is_read` (Int, default 0)
- `created_at` (String, ISO datetime)
- Index: `(user_id, is_read, created_at)` for efficient unread fetching
- Hard-deleted after 14 days by server cleanup task

**Setting** (`settings`)
- `key` (String, PK) — e.g. `"registration_open"`
- `value` (String) — e.g. `"true"` or `"false"`
- Seeded on startup via `server.js`. Editable via admin panel.

Database file location: `DATABASE_URL` env var (Prisma format, e.g. `file:/data/app.db`). Sessions stored separately at `/data/sessions.sqlite`.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `file:/data/app.db` | Prisma SQLite connection string |
| `SESSION_SECRET` | `"dev-secret"` | Secret for signing session cookies |
| `NODE_ENV` | `development` | Environment mode (enables secure cookie in production) |
| `MEDIA_PATH` | `/media` | Directory for uploaded media files |
| `RESEND_API_KEY` | — | Resend SMTP API key for sending emails (falls back to console logging if unset) |
| `EMAIL_FROM` | — | Sender address for emails (e.g. `"Вопли <noreply@vopley.net>"`) |
| `ANNOUNCEMENTS_SECRET` | — | Secret key required to post/replace announcements via the API |
| `ADMIN_EMAIL` | — | Admin panel login email |
| `ADMIN_PASSWORD_HASH` | — | BCrypt hash of admin password. Generate: `node -e "import('bcryptjs').then(b=>b.default.hash('YOUR_PASSWORD',12).then(console.log))"` |
| `ADMIN_COOKIE_SECRET` | — | Secret for AdminJS session cookie (min 32 chars). Required in production. |

Environment files: `.env` (production), `.env.dev` (development), `.env.example` (template).

## Testing

The project has a full test suite using **Vitest** for both the backend and frontend.

### Running Tests

```sh
# API tests (unit + integration)
make test            # or: cd api && npm test

# Web tests
make test-web        # or: cd web && npm test

# Both together
make test-all

# With coverage reports (output to api/coverage/ or web/coverage/)
make test-coverage
make test-web-coverage

# In Docker (API only)
make test-docker
```

### API Tests (`api/tests/`)

Tests are run sequentially (not in parallel) to avoid SQLite write conflicts.

**Test infrastructure:**
- `tests/setup.js` — Vitest `globalSetup`: creates a fresh SQLite DB at `tests/test.db`, runs Prisma migrations, writes a temp `.env.test` file, and cleans everything up in teardown.
- `tests/env.js` — Vitest `setupFiles`: loads `.env.test` into `process.env` for each test worker.
- `tests/helpers.js` — Shared utilities: `getApp()` (lazy app import), `request()` (supertest), `authenticatedAgent(user)` (supertest agent with session cookie), `cleanDb()` (truncate all tables), `disconnectDb()`.
- `tests/fixtures/index.js` — Factory functions: `createUser()`, `createShout()`, `createComment()`, etc. Users are created with a known `_rawPassword` for authentication in tests.

**Mocked modules in tests:**
- `../src/email.js` — `sendVerificationEmail` is a no-op
- `../src/sse.js` — `broadcast`, `broadcastToUser`, `addClient` are no-ops (prevents heartbeat intervals leaking)
- `../src/admin.js` — `setupAdmin` is a no-op (prevents AdminJS initialization overhead)

**Coverage config** (`vitest.config.js`):
- Provider: v8
- Includes: `src/**/*.js`
- Excludes: `src/server.js`, `src/swagger.js`
- Reports: text, HTML, JSON summary → `api/coverage/`

### Web Tests (`web/`)

Uses `jsdom` environment with `@testing-library/react`.

**Test infrastructure:**
- `web/tests/setup.ts` — Global DOM mocks (`window.matchMedia`, `window.scrollTo`)
- `web/tests/helpers.tsx` — `renderWithProviders()` helper wraps components with all required context providers
- `web/vitest.config.ts` — Merges Vite config; sets environment to `jsdom`, loads `tests/setup.ts`; 10s test timeout, 15s hook timeout

**Context tests (co-located with source files):**
- `web/context/AuthContext.test.tsx` — Login/logout, registration flow, password reset, modal state, error handling
- `web/context/ThemeContext.test.tsx` — Theme toggling and `localStorage` persistence
- `web/context/NotificationsContext.test.tsx` — SSE subscription, real-time notification updates, batched mark-as-read, cleanup on unmount
- `web/context/ContentPreferencesContext.test.tsx` — Content visibility preference toggles

**Hook tests (co-located with source files):**
- `web/hooks/useRoute.test.ts` — Hash-based routing (feed, profile, shout pages), navigation, `hashchange` events
- `web/hooks/useSSE.test.ts` — SSE client auto-reconnect, exponential backoff (1s → 30s cap)
- `web/hooks/useMentionUsers.test.ts` — @mention user list lazy loading and module-level singleton cache

**Unit tests:**
- `web/tests/unit/effectiveLength.test.ts` — Character counting: mention token normalization (`@[name:id]` → `@name`), spoiler marker stripping (`||content||`), newline cost (40 chars per newline), and combinations

**Coverage config** (`web/vitest.config.ts`):
- Provider: v8
- Includes: `components/**`, `context/**`, `hooks/**`
- Reports: text, HTML, JSON summary → `web/coverage/`

### Git Hooks (Husky)

Two hooks gate commits and pushes:

**Pre-commit** (`.husky/pre-commit`) — runs linting before every `git commit`:
```sh
npm run lint --prefix api || exit 1
npm run lint --prefix web || exit 1
```

**Pre-push** (`.husky/pre-push`) — runs the full test suite before every `git push`:
```sh
npm test --prefix api || exit 1
npm test --prefix web || exit 1
```

Hooks are installed via `make install` (or `npm install` in the repo root, which triggers `husky`).

### Linting

Both packages use **ESLint** with flat config (`eslint.config.js`):

| Package | Config highlights |
|---------|------------------|
| `api/` | `@eslint/js` recommended; Node globals; allows `console.*`; unused vars with `^_` prefix are allowed |
| `web/` | `typescript-eslint` recommended; `eslint-plugin-react-hooks` (rules of hooks); `no-explicit-any` is warn not error; `^_` prefix convention for intentionally unused identifiers |

Run linting manually:
```sh
cd api && npm run lint
cd web && npm run lint
```

### CI (GitHub Actions)

`.github/workflows/ci.yml` runs on all pull requests targeting `main`:
1. Installs API and web dependencies
2. Generates the Prisma client
3. Lints API (`npm run lint --prefix api`)
4. Lints web (`npm run lint --prefix web`)
5. Runs `npm test` for both API and web

## Code Conventions

### Backend (api/)

- ES Modules (`import`/`export`) — `"type": "module"` in package.json
- `dotenv/config` imported at the top of `server.js` — `.env` file is auto-loaded in dev
- Express app is defined in `app.js` (exported as default); `server.js` only calls `.listen()` and seeds settings
- Database access via **Prisma Client** (`prisma.user.findUnique(...)`, `prisma.shout.findMany(...)`, etc.)
- Input validation with **Zod** schemas (defined in `helpers/validation.js`, used across domain route files)
- Session-based auth (not JWT) — sessions stored in SQLite via `connect-sqlite3`; in test mode, in-memory sessions are used
- Sessions have a 30-day max age with `rolling: true` (extended on every authenticated request)
- Password hashing with **bcryptjs** (10 rounds; 4 rounds in tests for speed)
- Email sending via **nodemailer** through Resend SMTP (`smtp.resend.com:465`)
- Rate limiting: auth endpoints at 20 req/min (forgot-password/send-code at 5/min); upload and shout creation at 100 req/10min per user (falls back to IP)
- All IDs are UUIDs generated with `crypto.randomUUID()`
- JSON error responses: `{ error: "message" }`
- Image processing via **Sharp**: auto-rotate, strip EXIF, generate WebP variants, atomic move from tmp to permanent storage
- Animated GIFs: original `.gif` is preserved alongside static WebP thumbnails generated from the first frame
- Shout/comment character limit: 400 effective chars, where each newline costs 40 chars (`effectiveCharCount` helper)
- API documentation via **swagger-ui-express** + OpenAPI 3.0.3 spec (`swagger.js`) — dev only, blocked by nginx in production
- Graceful shutdown: `SIGTERM`/`SIGINT` handlers disconnect Prisma before exiting
- Request logging: every request is logged as `[API] METHOD /path` to stdout (skipped in test mode)
- Linting: ESLint via `npm run lint` (`eslint src`); intentionally unused variables prefixed with `_`

### Frontend (web/)

- Functional components with TypeScript strict mode
- Source files live directly under `web/` (no `src/` subdirectory)
- React Context for auth state — use `useAuth()` hook from `AuthContext.tsx`
- React Context for theme — use `useTheme()` hook from `ThemeContext.tsx`; theme stored in `localStorage`
- React Context for notifications — use `useNotifications()` hook from `NotificationsContext.tsx`
- React Context for content preferences — use `useContentPreferences()` hook from `ContentPreferencesContext.tsx`
- Auth flow: 2-step registration (send code → verify), password reset (send code → verify → new password)
- Hash-based routing via `useRoute.ts` — routes: `#/` (feed), `#/profile/{userId}`, `#/shout/{shoutId}`
- Styling with **Tailwind CSS** utility classes (loaded via CDN in `index.html`) and CSS custom properties
- Theme tokens: all colors use `th-*` Tailwind classes (e.g. `bg-th-card`, `text-th-text-3`) backed by CSS variables `--th-*`. Dark mode is toggled via the `.dark` class on `<html>`.
- Fetch API with `credentials: "include"` for all requests
- Optimistic UI updates with rollback on error (likes, delete)
- PascalCase for components, camelCase for functions/variables
- All user-facing text is in Russian, including Russian time formatting with proper declensions
- Linting: ESLint via `npm run lint` (`eslint .`); TypeScript strict; react-hooks rules enforced; `no-explicit-any` is a warning; intentionally unused variables prefixed with `_`

## Architecture Notes

- The backend is a stateless Express server (sessions persisted in SQLite, so restarts don't log users out).
- The Express app is defined in `app.js` and imported by both `server.js` (production) and the test suite. This separation allows integration tests to import the app without starting an HTTP server or loading dotenv.
- The frontend is a single-page application using hash-based routing — no server-side route handling needed.
- Comments are stored in a separate `comments` table (not as shouts) — single level of threading, no deep nesting.
- Shout and comment deletion is a soft-delete: the `is_deleted` flag is set but the row is retained. `is_deleted=2` marks content from banned users.
- Shouts carry a `visibility_tag` field (`""`, `"spoiler"`, `"nsfw"`, `"politics"`) that the frontend can use to filter or blur content based on user preferences (`show_nsfw`, `show_politics` on the User model; `showMedia` is client-side only in `ContentPreferencesContext`). **Spoiler and NSFW tags require media to be attached** — the backend strips those tags if no media is present; the frontend also prevents selecting them without media in `ShoutInput.tsx`.
- @mentions are supported in shouts and comments. The composer (`MentionInput.tsx`) is a `contenteditable` div. Typing `@` opens a dropdown of up to 5 matching users (filtered client-side from a module-level cached list). Selected mentions are serialized as `@[username:userId]` tokens in the stored content string. `renderContent` in `ShoutCard.tsx` parses these tokens and renders them as `#/profile/:id` links. Character counting normalizes `@[name:id]` back to `@name` before applying the 400-char limit. The user list is fetched lazily (only on first `@` trigger) via `GET /users/mentions` and cached for the browser session.
- Mentions automatically trigger `mention` notifications to the mentioned users. Comments also trigger a `reply` notification to the shout author (unless they are the commenter, or already received a mention notification for that comment). Both are handled in `routes/shouts.js` and `routes/comments.js` using `helpers/mentions.js`.
- Media is stored in a separate `media` table, referenced by `shouts.media_id` or `comments.media_id`. A shout/comment can have either an image or a YouTube video, not both.
- YouTube URLs in shout content are auto-detected via regex and metadata is fetched from the oEmbed API (5s timeout, graceful fallback).
- Image uploads are processed by Sharp into multiple WebP sizes (320/960/1600px for posts, 64/128/256px for avatars). EXIF data is stripped.
- Animated GIFs skip re-encoding; the original GIF is stored as `original.gif` alongside WebP thumbnail variants. The `animated: true` flag and `gif` URL are included in the media DTO.
- Images in the feed can be viewed fullscreen via the `Lightbox` component (`web/components/Lightbox.tsx`). It supports drag-to-dismiss (vertical swipe with velocity detection), Escape key, click-outside close, and locks background scroll while open. Uses pointer events for unified mouse/touch handling. Supports pinch-to-zoom (mobile) and scroll-to-zoom (desktop), pan when zoomed, and double-tap/click to toggle zoom.
- The media nginx container serves files from the `/media` volume with a strict allowlist: `.webp`, `.jpg`, `.jpeg`, `.png`, `.gif` extensions only; no dotfiles or directory listing; immutable 1-year cache headers.
- Popular sort: shouts from the last 7 days. The popular tab has dual sort buttons — heart icon (sort by like count) and comment icon (sort by comment count). Uses `popularSort` state toggled by `handlePopularSortChange` in `ShoutFeed.tsx`.
- Registration requires email verification: a 6-digit code is sent via Resend SMTP, validated before account creation. Codes expire in 10 minutes, max 5 attempts. Registration can be disabled by setting `registration_open=false` in the Settings table via the admin panel.
- Password reset follows the same email verification pattern.
- Announcements are a single-active-record pattern: only the latest non-deleted row is returned by `GET /announcements`. Posting a new one soft-deletes all existing active ones.
- The `web/package.json` dev script runs both the API and Vite concurrently for local development.
- `App.tsx` wraps the app in `<ThemeProvider>` (outer) → `<AuthProvider>` → `<NotificationsProvider>` (inner).
- Nginx CSP headers allow embeds from YouTube (nocookie), Coub, and Tenor; images from YouTube thumbnails, DiceBear avatars, Imgur, Tenor, and fxTwitter; and connect-src to fxTwitter API.

## Backup & Restore

The `scripts/` directory at the repo root contains backup/restore tooling for Docker volumes.

```sh
# Backup production (creates timestamped tarballs in ./backups/)
./scripts/backup.sh prod

# Backup and sync to Google Drive via rclone
./scripts/backup.sh prod --upload

# Restore from latest backup (prompts for confirmation, stops containers first)
./scripts/restore.sh prod

# Restore from a specific timestamp
./scripts/restore.sh prod 20260218_120000
```

Backups keep the last 3 snapshots per type (configurable via `KEEP` variable in the script). The database is backed up using `sqlite3 .backup` for atomic hot snapshots without stopping the server.

## Docker Services

Three docker-compose files:
- `docker-compose.yml` — production (port 3005)
- `docker-compose.dev.yml` — development (port 3006, isolated volumes)
- `docker-compose.test.yml` — test runner (single service, tmpfs DB)

Production and development each define four services:

| Service | Description |
|---------|-------------|
| `api` / `api-dev` | Express backend (internal port 3000). Runs `prisma migrate deploy` on startup via `scripts/start.sh`. Dev container mounts `./api/src` as read-only for hot-reload without rebuild. |
| `media` / `media-dev` | Security-hardened Nginx serving `/media` volume (images and GIFs only) |
| `nginx` / `nginx-dev` | Reverse proxy; routes `/api/*` to api, `/media/*` to media, `/admin` to api with HTTP basic auth, SPA fallback. Production blocks `/api/docs` (Swagger UI). SSE endpoint has buffering disabled and 24h timeout. |
| `web-build` / `web-build-dev` | One-shot container that builds the React app and populates the `webdist` shared volume |

Production volumes: `appdata`, `webdist`, `media`. Development volumes: `appdata-dev`, `webdist-dev`, `media-dev` (fully isolated).

The test service (`api-test`) uses the `test` Dockerfile target, runs with `tmpfs` for `/tmp` and `/data`, and exits with the vitest coverage exit code.

## Current Gaps

- No Prettier or other auto-formatter (ESLint is active but doesn't enforce style)
- No error boundary components in the React frontend
- Tailwind is loaded via CDN rather than built into the bundle
- Legacy inline media columns on `shouts` table to be removed in a follow-up migration
- Notification `type` field in schema has a comment noting planned future types (`shout_like`, `comment_like`) not yet implemented
- Web component tests are not yet written (contexts and hooks are covered; `components/` directory has no test files)
