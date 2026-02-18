# CLAUDE.md

## Project Overview

This is **Kanobu Shouts Clone** (branded "Вопли") — a Twitter/X-style social media web application where users post short messages ("shouts"), comment on them, like content, attach images or YouTube videos, and manage user profiles. The UI is entirely in Russian.

**Stack**: React 18 + TypeScript + Vite (frontend) / Node.js + Express + Prisma + SQLite (backend) / Docker + Nginx (deployment)

## Repository Structure

```
.
├── api/                    # Backend (Express.js)
│   ├── src/
│   │   ├── server.js       # Express app setup, session middleware, rate limiting
│   │   ├── routes.js       # All API route handlers
│   │   ├── db.js           # Prisma client init (WAL mode, foreign keys)
│   │   ├── auth.js         # Password hashing, session auth utilities
│   │   └── email.js        # Email sending via nodemailer + Resend SMTP
│   ├── prisma/
│   │   ├── schema.prisma   # Prisma schema (all models)
│   │   └── migrations/     # Prisma migration files
│   ├── scripts/
│   │   └── start.sh        # Docker entrypoint: runs prisma migrate deploy, then starts server
│   ├── package.json
│   ├── Dockerfile          # Alpine Node 20, installs vips-dev + openssl for Sharp & Prisma
│   └── .dockerignore
├── web/                    # Frontend (React + TypeScript)
│   ├── components/
│   │   ├── Header.tsx        # App header with auth & navigation buttons
│   │   ├── AuthModal.tsx     # Login/register/password-reset modal (multi-step with email verification)
│   │   ├── ShoutFeed.tsx     # Main feed with pagination, sort, media toggle
│   │   ├── ShoutInput.tsx    # Shout composer with media, emoji, drag-drop
│   │   ├── ShoutCard.tsx     # Individual shout with comments, likes, delete
│   │   ├── ProfilePage.tsx   # User profile view and edit form
│   │   ├── AvatarUpload.tsx  # Drag-drop avatar upload with preview
│   │   └── EmojiPicker.tsx   # Emoji picker with grouped categories
│   ├── context/
│   │   └── AuthContext.tsx   # Auth state via React Context + API helper
│   ├── hooks/
│   │   └── useRoute.ts       # Hash-based client-side routing
│   ├── App.tsx               # Root component with routing
│   ├── index.tsx             # React entry point (StrictMode)
│   ├── types.ts              # TypeScript type definitions
│   ├── index.html            # HTML template (Tailwind CDN, dark preset)
│   ├── tsconfig.json
│   ├── vite.config.ts        # Dev proxy: /api and /media → localhost:3000
│   ├── package.json
│   ├── Dockerfile
│   └── .dockerignore
├── docker-compose.yml      # Production: 4 services on port 3005
├── docker-compose.dev.yml  # Development: 4 services on port 3006 (isolated volumes)
├── nginx.conf              # Production reverse proxy
├── nginx-dev.conf          # Development reverse proxy
├── media-nginx.conf        # Security-hardened media file server
├── Makefile                # Shortcuts for docker-compose commands (prod + dev)
├── .env                    # Production environment variables
├── .env.dev                # Development environment variables
├── .env.example            # Template with placeholder values
└── README.md
```

## Quick Start

### Prerequisites

- Node.js (v18+)
- npm

### Install Dependencies

```sh
cd api && npm install
cd ../web && npm install
```

### Run in Development

```sh
cd web && npm run dev
```

This uses `concurrently` to start both the backend API (`node src/server.js` on port 3000) and the Vite dev server (port 5173). In dev mode the API also serves `/media` as static files.

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

## API Endpoints

All endpoints are prefixed with `/api/v1/`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Health check — `{ ok: true }` |
| GET | `/me` | No | Get current user session |
| POST | `/auth/register/send-code` | No | Step 1: validate inputs, send email verification code (rate limited 20/min) |
| POST | `/auth/register/verify` | No | Step 2: verify code, create account, auto-login (rate limited 20/min) |
| POST | `/auth/login` | No | Login with username or email (rate limited 20/min) |
| POST | `/auth/logout` | Yes | Logout, destroy session |
| POST | `/auth/forgot-password/send-code` | No | Send password reset code (rate limited 5/min) |
| POST | `/auth/forgot-password/reset` | No | Verify code + set new password, auto-login (rate limited 20/min) |
| GET | `/shouts?limit=&offset=&sortBy=` | No | List shouts with pagination (max 50). `sortBy=new\|popular` |
| POST | `/shouts` | Yes | Create a shout (text, mediaId, or youtubeUrl) |
| DELETE | `/shouts/:id` | Yes | Soft-delete own shout |
| POST | `/shouts/:id/replies` | Yes | Add a comment to a shout |
| POST | `/shouts/:id/like` | Yes | Toggle like, returns new count |
| DELETE | `/comments/:id` | Yes | Soft-delete own comment |
| POST | `/comments/:id/like` | Yes | Toggle like on a comment |
| GET | `/users/:id` | No | Get user profile (email visible to owner only) |
| GET | `/users/:id/shouts` | No | Paginated list of a user's shouts |
| PUT | `/users/:id` | Yes | Update profile (username, email, avatar, password) |
| POST | `/upload/media` | Yes | Upload image (≤5MB JPG/PNG/WebP; generates 320/960/1600px WebP variants) |
| POST | `/upload/avatar` | Yes | Upload avatar (≤2MB JPG/PNG/WebP; generates 64/128/256px square WebP) |
| GET | `/avatars/:userId/:size.webp` | No | Serve avatar with immutable cache headers |

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
- `created_at` (String, ISO datetime)

**Shout** (`shouts`)
- `id` (String, UUID, PK)
- `user_id` (String, FK → users)
- `parent_id` (String?, FK → shouts, legacy)
- `content` (String)
- `media_id` (String?, FK → media)
- `is_deleted` (Int, default 0, soft-delete)
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
- `media_meta` (String?): JSON blob with width/height/title/channel
- `created_at` (String, ISO datetime)

**ShoutLike** (`shout_likes`)
- Composite PK: `(shout_id, user_id)`
- Cascading deletes

**CommentLike** (`comment_likes`)
- Composite PK: `(comment_id, user_id)`
- Cascading deletes

**VerificationCode** (`verification_codes`)
- `id` (String, UUID, PK)
- `email`, `code`, `purpose` (`"register"` or `"reset"`), `payload` (JSON?), `expires_at`, `used`, `attempts`, `created_at`
- Index: `(email, purpose, used)`

Database file location: `DATABASE_URL` env var (Prisma format, e.g. `file:/data/app.db`). Sessions stored separately at `/data/sessions.sqlite`.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `file:/data/app.db` | Prisma SQLite connection string |
| `SESSION_SECRET` | `"dev-secret"` | Secret for signing session cookies |
| `NODE_ENV` | `development` | Environment mode (enables secure cookie in production) |
| `MEDIA_PATH` | `/media` | Directory for uploaded media files |
| `RESEND_API_KEY` | — | Resend SMTP API key for sending emails (falls back to console logging if unset) |
| `EMAIL_FROM` | — | Sender address for emails (set in docker-compose, e.g. `"Вопли <noreply@vopley.net>"`) |

Environment files: `.env` (production), `.env.dev` (development), `.env.example` (template).

## Code Conventions

### Backend (api/)

- ES Modules (`import`/`export`) — `"type": "module"` in package.json
- Database access via **Prisma Client** (`prisma.user.findUnique(...)`, `prisma.shout.findMany(...)`, etc.)
- Input validation with **Zod** schemas (see `routes.js` for all schemas)
- Session-based auth (not JWT) — sessions stored in SQLite via `connect-sqlite3`
- Password hashing with **bcryptjs** (10 rounds)
- Email sending via **nodemailer** through Resend SMTP (`smtp.resend.com:465`)
- Rate limiting: auth endpoints at 20 req/min (forgot-password/send-code at 5/min); upload and shout creation at 100 req/10min per user (falls back to IP)
- All IDs are UUIDs generated with `crypto.randomUUID()`
- JSON error responses: `{ error: "message" }`
- Image processing via **Sharp**: auto-rotate, strip EXIF, generate WebP variants, atomic move from tmp to permanent storage

### Frontend (web/)

- Functional components with TypeScript strict mode
- Source files live directly under `web/` (no `src/` subdirectory)
- React Context for auth state management — use `useAuth()` hook
- Auth flow: 2-step registration (send code → verify), password reset (send code → verify → new password)
- Hash-based routing via `useRoute.ts` — routes: `#/` (feed), `#/profile/{userId}`
- Styling with **Tailwind CSS** utility classes (loaded via CDN in `index.html`)
- Fetch API with `credentials: "include"` for all requests
- Optimistic UI updates with rollback on error (likes, delete)
- PascalCase for components, camelCase for functions/variables
- All user-facing text is in Russian, including Russian time formatting with proper declensions

## Architecture Notes

- The backend is a stateless Express server (sessions persisted in SQLite, so restarts don't log users out).
- The frontend is a single-page application using hash-based routing — no server-side route handling needed.
- Comments are stored in a separate `comments` table (not as shouts) — single level of threading, no deep nesting.
- Shout and comment deletion is a soft-delete: the `is_deleted` flag is set but the row is retained.
- Media is stored in a separate `media` table, referenced by `shouts.media_id` or `comments.media_id`. A shout/comment can have either an image or a YouTube video, not both.
- YouTube URLs in shout content are auto-detected via regex and metadata is fetched from the oEmbed API (5s timeout, graceful fallback).
- Image uploads are processed by Sharp into multiple WebP sizes (320/960/1600px for posts, 64/128/256px for avatars). EXIF data is stripped.
- The media nginx container serves files from the `/media` volume with a strict allowlist: only `.webp`, `.jpg`, `.jpeg`, `.png` extensions, no dotfiles or directory listing, immutable 1-year cache headers.
- Popular sort: shouts from the last 7 days, ordered by like count.
- Registration requires email verification: a 6-digit code is sent via Resend SMTP, validated before account creation.
- Password reset follows the same email verification pattern.
- The `web/package.json` dev script runs both the API and Vite concurrently for local development.

## Docker Services

Two docker-compose files: `docker-compose.yml` (production, port 3005) and `docker-compose.dev.yml` (development, port 3006).

Each defines four services:

| Service | Description |
|---------|-------------|
| `api` / `api-dev` | Express backend (internal port 3000). Runs `prisma migrate deploy` on startup via `scripts/start.sh` |
| `media` / `media-dev` | Security-hardened Nginx serving `/media` volume (images only) |
| `nginx` / `nginx-dev` | Reverse proxy; routes `/api/*` to api, `/media/*` to media, SPA fallback |
| `web-build` / `web-build-dev` | One-shot container that builds the React app and populates the `webdist` shared volume |

Production volumes: `appdata`, `webdist`, `media`. Development volumes: `appdata-dev`, `webdist-dev`, `media-dev` (fully isolated).

## Current Gaps

- No automated tests (no test framework configured)
- No linting or formatting tools (no ESLint/Prettier)
- No CI/CD pipeline
- No error boundary components in the React frontend
- Tailwind is loaded via CDN rather than built into the bundle
- Legacy inline media columns on `shouts` table to be removed in a follow-up migration
