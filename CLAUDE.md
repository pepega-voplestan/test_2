# CLAUDE.md

## Project Overview

This is **Kanobu Shouts Clone** — a Twitter/X-style social media web application where users post short messages ("shouts"), reply to them, and like content. The UI is entirely in Russian.

**Stack**: React 18 + TypeScript + Vite (frontend) / Node.js + Express + SQLite (backend) / Docker + Nginx (deployment)

## Repository Structure

```
.
├── api/                    # Backend (Express.js)
│   ├── src/
│   │   ├── server.js       # Express app setup, session middleware, rate limiting
│   │   ├── routes.js       # All API route handlers
│   │   ├── db.js           # SQLite database init & schema
│   │   └── auth.js         # Password hashing, session auth utilities
│   ├── package.json
│   └── Dockerfile
├── web/                    # Frontend (React + TypeScript)
│   ├── components/
│   │   ├── Header.tsx      # App header with auth buttons
│   │   ├── AuthModal.tsx   # Login/registration modal
│   │   ├── ShoutFeed.tsx   # Main feed with pagination
│   │   ├── ShoutInput.tsx  # New shout form
│   │   └── ShoutCard.tsx   # Individual shout with replies & likes
│   ├── context/
│   │   └── AuthContext.tsx  # Auth state via React Context
│   ├── index.tsx           # React entry point
│   ├── App.tsx             # Root component
│   ├── types.ts            # TypeScript type definitions
│   ├── index.html          # HTML template
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── Dockerfile
├── docker-compose.yml      # Three services: api, nginx, web-build
├── nginx.conf              # Reverse proxy config
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

This uses `concurrently` to start both the backend API (`node src/server.js` on port 3000) and the Vite dev server (port 5173).

### Run with Docker

```sh
docker-compose up --build
```

The app will be available on port 3005. Nginx proxies `/api/*` to the backend; all other routes serve the frontend SPA.

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | No | Health check |
| GET | `/api/me` | No | Get current user session |
| POST | `/api/auth/register` | No | Register (rate limited) |
| POST | `/api/auth/login` | No | Login (rate limited) |
| POST | `/api/auth/logout` | Yes | Logout |
| GET | `/api/shouts?limit=&offset=` | No | List shouts with pagination |
| POST | `/api/shouts` | Yes | Create a shout |
| POST | `/api/shouts/:id/replies` | Yes | Reply to a shout |
| POST | `/api/shouts/:id/like` | Yes | Toggle like on a shout |

## Database

SQLite with WAL mode and foreign keys enabled. Three tables:

- **users** — `id` (UUID), `username`, `password_hash`, `avatar`, `is_banned`, `created_at`
- **shouts** — `id` (UUID), `user_id`, `parent_id` (nullable, for replies), `content`, `created_at`
- **shout_likes** — composite PK `(shout_id, user_id)`, `created_at`

Database file location is controlled by `DATABASE_PATH` env var (default: `/data/app.db`).

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_PATH` | `/data/app.db` | SQLite database file path |
| `SESSION_SECRET` | (generated) | Secret for signing session cookies |
| `NODE_ENV` | `development` | Environment mode |

## Code Conventions

### Backend (api/)

- ES Modules (`import`/`export`) — `"type": "module"` in package.json
- Input validation with **Zod** schemas
- Session-based authentication (not JWT) — sessions stored in SQLite via `connect-sqlite3`
- Password hashing with **bcryptjs** (10 rounds)
- Rate limiting on auth endpoints (20 req/min)
- All IDs are UUIDs generated with `crypto.randomUUID()`
- SQL via `better-sqlite3` prepared statements (synchronous API)
- JSON error responses: `{ error: "message" }`

### Frontend (web/)

- Functional components with TypeScript (strict mode)
- React Context for auth state management (`useAuth()` hook)
- Styling with **Tailwind CSS** utility classes
- Fetch API for HTTP requests with `credentials: "include"`
- Optimistic UI updates (e.g., likes toggle with rollback on error)
- PascalCase for components, camelCase for functions/variables
- All user-facing text is in Russian

## Architecture Notes

- The backend is a stateless Express server (aside from SQLite). Sessions are persisted in the database, so the API can be restarted without logging users out.
- The frontend is a single-page application. Nginx serves the built static files and proxies `/api/*` to the backend.
- Replies are modeled as shouts with a non-null `parent_id`, forming a single level of threading (not deeply nested).
- The `web/package.json` dev script runs both the API server and Vite concurrently for local development.

## Current Gaps

- No automated tests (no test framework configured)
- No linting or formatting tools (no ESLint/Prettier)
- No CI/CD pipeline
- No error boundary components in the React frontend
