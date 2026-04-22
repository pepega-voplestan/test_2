# Vopley.net

<!-- Use /docs command when updating documentation — do not edit CLAUDE.md manually -->

<!-- ESSENTIAL:START — Project core. Update via /docs command, do not touch manually -->

Twitter/X-style social media app ("shouts" = posts). Russian UI. Stack: React 18 + TypeScript + Vite / Node.js + Express + Prisma + PostgreSQL / BullMQ + Redis / Docker + Nginx

## Quick Start

```sh
make install          # install all deps (root + api + web + workers) + husky hooks
cd web && npm run dev # API (port 3000) + Vite (port 5173) via concurrently
make local            # Docker local dev (port 3006, hot-reload, isolated volumes)
make prod             # Docker production (ports 80/443)
```

## Makefile Targets

| Target | Description |
|--------|-------------|
| `make prod` / `make local` | Start production / local containers |
| `make deploy` / `make deploy-local` | Backup + rebuild + start |
| `make logs` / `make logs-local` | Follow logs |
| `make backup` / `make backup-upload` | Backup volumes / + rclone to Google Drive |
| `make restore` | Restore latest backup (or `TIMESTAMP=YYYYMMDD_HHMMSS`) |
| `make test` / `make test-web` / `make test-all` | Run API / web / both tests |
| `make db-pull` / `make db-pull-local` | Dump PostgreSQL DB locally |

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

## Common Mistakes to Avoid

- **`visibility_tag` strip** — backend strips spoiler/nsfw if no `media_id`; frontend blocks selection too but is not the only guard; both must be in sync
- **SSEProvider order** — `SSEProvider` must be ancestor of `NotificationsProvider` and any `useSSE` consumer; wrong order = silent runtime errors
- **Admin panel fatality in prod** — any uncaught error in `admin.js` exits with code 1 in production; always test admin changes before deploying
- **`@mention` token format** — serialized as `@[username:userId]`, not plain `@username`; rendering, char counting, and notification extraction all depend on this exact format
- **Notification dedup** — reply notification suppressed if commenter already mentioned in the same comment; both cases in `routes/comments.js`; don't split this logic
- **Pinned shout** — setting a new pin via admin does NOT auto-unpin the previous; verify behavior when touching pin-related features
- **Test isolation** — tests run sequentially; never introduce `describe`-level parallelism or shared mutable state between test files
- **`bcrypt` rounds** — 10 in prod, 4 in tests; set via env in `tests/setup.js`; don't hardcode rounds in business logic
- **Rate limit fallback** — upload + shout-create rate limit falls back to IP if unauthenticated; test both auth states when touching these endpoints

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
| Add a new context provider | Follow order in `web/App.tsx` (see provider order in [web docs](docs/web.md)) |

<!-- ESSENTIAL:END -->

## Detailed Documentation

- [API](docs/api.md) — routes, endpoints, DB schema, SSE events, notifications, env vars, backend conventions
- [Web](docs/web.md) — components, contexts, hooks, frontend conventions, mobile/iOS rules, architecture
- [Testing](docs/testing.md) — test setup, fixtures, CI/CD, linting
- [Infrastructure](docs/infra.md) — Docker services, workers/jobs, backup/restore, known tech debt
