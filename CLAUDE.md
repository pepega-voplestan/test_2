# CLAUDE.md

## Project Overview

This is **Kanobu Shouts Clone** (branded "Вопли") — a Twitter/X-style social media web application where users post short messages ("shouts"), reply to them, like content, attach images or YouTube videos, and manage user profiles. The UI is entirely in Russian.

**Stack**: React 18 + TypeScript + Vite (frontend) / Node.js + Express + SQLite (backend) / Docker + Nginx (deployment)

## Repository Structure

```
.
├── api/                    # Backend (Express.js)
│   ├── src/
│   │   ├── server.js       # Express app setup, session middleware, rate limiting
│   │   ├── routes.js       # All API route handlers (~928 lines)
│   │   ├── db.js           # SQLite database init & schema (migration-safe)
│   │   └── auth.js         # Password hashing, session auth utilities
│   ├── package.json
│   ├── Dockerfile          # Alpine Node 20, installs vips-dev for Sharp
│   └── .dockerignore
├── web/                    # Frontend (React + TypeScript)
│   ├── src/
│   │   ├── components/
│   │   │   ├── Header.tsx        # App header with auth & navigation buttons
│   │   │   ├── AuthModal.tsx     # Login/registration modal (tab-based)
│   │   │   ├── ShoutFeed.tsx     # Main feed with pagination, sort, media toggle
│   │   │   ├── ShoutInput.tsx    # Shout composer with media, emoji, drag-drop
│   │   │   ├── ShoutCard.tsx     # Individual shout with replies, likes, delete
│   │   │   ├── ProfilePage.tsx   # User profile view and edit form
│   │   │   ├── AvatarUpload.tsx  # Drag-drop avatar upload with preview
│   │   │   └── EmojiPicker.tsx   # Emoji picker with grouped categories
│   │   ├── context/
│   │   │   └── AuthContext.tsx   # Auth state via React Context + API helper
│   │   ├── hooks/
│   │   │   └── useRoute.ts       # Hash-based client-side routing
│   │   ├── App.tsx               # Root component with routing
│   │   ├── index.tsx             # React entry point (StrictMode)
│   │   ├── types.ts              # TypeScript type definitions
│   │   ├── index.html            # HTML template (Tailwind CDN, dark preset)
│   │   ├── tsconfig.json
│   │   └── vite.config.ts        # Dev proxy: /api and /media → localhost:3000
│   ├── package.json
│   ├── Dockerfile
│   └── .dockerignore
├── docker-compose.yml      # Four services: api, media, nginx, web-build
├── nginx.conf              # Main reverse proxy (port 3005)
├── media-nginx.conf        # Security-hardened media file server
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
docker-compose up --build
```

The app will be available on port 3005. Nginx proxies `/api/*` to the backend and `/media/*` to the media server; all other routes serve the frontend SPA.

## API Endpoints

All endpoints are prefixed with `/api/v1/`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Health check — `{ ok: true }` |
| GET | `/me` | No | Get current user session |
| POST | `/auth/register` | No | Register (rate limited 20/min) |
| POST | `/auth/login` | No | Login with username or email (rate limited 20/min) |
| POST | `/auth/logout` | Yes | Logout, destroy session |
| GET | `/shouts?limit=&offset=&sortBy=` | No | List shouts with pagination (max 50). `sortBy=new\|popular` |
| POST | `/shouts` | Yes | Create a shout (text, mediaId, or youtubeUrl) |
| DELETE | `/shouts/:id` | Yes | Soft-delete own shout |
| POST | `/shouts/:id/replies` | Yes | Reply to a shout |
| POST | `/shouts/:id/like` | Yes | Toggle like, returns new count |
| GET | `/users/:id` | No | Get user profile (email visible to owner only) |
| GET | `/users/:id/shouts` | No | Paginated list of a user's shouts |
| PUT | `/users/:id` | Yes | Update profile (username, email, avatar, password) |
| POST | `/upload/media` | Yes | Upload image (≤5MB JPG/PNG/WebP; generates 320/960/1600px WebP variants) |
| POST | `/upload/avatar` | Yes | Upload avatar (≤2MB JPG/PNG/WebP; generates 64/128/256px square WebP) |
| GET | `/avatars/:userId/:size.webp` | No | Serve avatar with immutable cache headers |

## Database

SQLite with WAL mode and foreign keys enabled. Migration logic runs on startup and is designed to be safe across restarts.

### Tables

**users**
- `id` (TEXT, UUID, PK)
- `username` (TEXT, NOT NULL, UNIQUE)
- `password_hash` (TEXT, NOT NULL)
- `avatar` (TEXT)
- `email` (TEXT, NULLABLE, unique partial index on non-NULL values)
- `is_banned` (INTEGER, default 0)
- `created_at` (TEXT, ISO datetime)

**shouts**
- `id` (TEXT, UUID, PK)
- `user_id` (TEXT, FK → users)
- `parent_id` (TEXT, NULLABLE FK → shouts, for replies)
- `content` (TEXT)
- `media_id` (TEXT, NULLABLE FK → media)
- `is_deleted` (INTEGER, default 0, soft-delete flag)
- `created_at` (TEXT, ISO datetime)
- Indices: `(parent_id, created_at)`, `(created_at)`, `(is_deleted)`

**media**
- `id` (TEXT, UUID, PK)
- `user_id` (TEXT, FK → users)
- `media_type` (TEXT): `"image"` or `"youtube"`
- `media_url` (TEXT): relative path for images, video ID for YouTube
- `media_meta` (TEXT): JSON blob with width/height/title/channel
- `created_at` (TEXT, ISO datetime)

**shout_likes**
- Composite PK: `(shout_id, user_id)`
- Cascading deletes
- Indices on both columns

Database file location: `DATABASE_PATH` env var (default `/data/app.db`). Sessions stored separately at `/data/sessions.sqlite`.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_PATH` | `/data/app.db` | SQLite database file path |
| `SESSION_SECRET` | `"dev-secret"` | Secret for signing session cookies |
| `NODE_ENV` | `development` | Environment mode (enables secure cookie in production) |
| `MEDIA_PATH` | `/media` | Directory for uploaded media files |

## Code Conventions

### Backend (api/)

- ES Modules (`import`/`export`) — `"type": "module"` in package.json
- Input validation with **Zod** schemas (see `routes.js` for all schemas)
- Session-based auth (not JWT) — sessions stored in SQLite via `connect-sqlite3`
- Password hashing with **bcryptjs** (10 rounds)
- Rate limiting: auth endpoints at 20 req/min; upload and shout creation at 100 req/10min per user (falls back to IP)
- All IDs are UUIDs generated with `crypto.randomUUID()`
- SQL via `better-sqlite3` prepared statements (synchronous API)
- JSON error responses: `{ error: "message" }`
- Image processing via **Sharp**: auto-rotate, strip EXIF, generate WebP variants, atomic move from tmp to permanent storage

### Frontend (web/)

- Functional components with TypeScript strict mode
- React Context for auth state management — use `useAuth()` hook
- Hash-based routing via `useRoute.ts` — routes: `#/` (feed), `#/profile/{userId}`
- Styling with **Tailwind CSS** utility classes (loaded via CDN in `index.html`)
- Fetch API with `credentials: "include"` for all requests
- Optimistic UI updates with rollback on error (likes, delete)
- PascalCase for components, camelCase for functions/variables
- All user-facing text is in Russian, including Russian time formatting with proper declensions

## Architecture Notes

- The backend is a stateless Express server (sessions persisted in SQLite, so restarts don't log users out).
- The frontend is a single-page application using hash-based routing — no server-side route handling needed.
- Replies are modeled as shouts with a non-null `parent_id` — single level of threading, no deep nesting.
- Shout deletion is a soft-delete: the `is_deleted` flag is set but the row is retained.
- Media is stored in a separate `media` table, referenced by `shouts.media_id`. A shout can have either an image or a YouTube video, not both.
- YouTube URLs in shout content are auto-detected via regex and metadata is fetched from the oEmbed API (5s timeout, graceful fallback).
- Image uploads are processed by Sharp into multiple WebP sizes (320/960/1600px for posts, 64/128/256px for avatars). EXIF data is stripped.
- The media nginx container serves files from the `/media` volume with a strict allowlist: only `.webp`, `.jpg`, `.jpeg`, `.png` extensions, no dotfiles or directory listing, immutable 1-year cache headers.
- Popular sort: shouts from the last 7 days, ordered by like count.
- The `web/package.json` dev script runs both the API and Vite concurrently for local development.

## Docker Services

Four services in `docker-compose.yml`:

| Service | Description |
|---------|-------------|
| `api` | Express backend (internal port 3000) |
| `media` | Security-hardened Nginx serving `/media` volume (images only) |
| `nginx` | Reverse proxy on port 3005; routes `/api/*` to api, `/media/*` to media, SPA fallback |
| `web-build` | One-shot container that builds the React app and populates the `webdist` shared volume |

Shared volumes: `appdata` (SQLite DB), `webdist` (frontend build), `media` (user uploads).

## Current Gaps

- No automated tests (no test framework configured)
- No linting or formatting tools (no ESLint/Prettier)
- No CI/CD pipeline
- No error boundary components in the React frontend
- Tailwind is loaded via CDN rather than built into the bundle
