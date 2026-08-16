# Vopley.net

<!-- Use /docs command when updating documentation — do not edit CLAUDE.md manually -->

> **IMPORTANT — updating docs**: If asked to update or edit CLAUDE.md (or any file in `docs/`), you MUST invoke the `/docs` skill from `.claude/commands/docs.md` instead of editing files directly. Never manually edit CLAUDE.md or `docs/*.md` — always go through `/docs`.

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
| `make test` / `make test-web` / `make test-workers` / `make test-all` | Run API / web / workers / all tests |
| `make db-pull` / `make db-pull-local` | ⚠️ **Broken** — still runs `sqlite3` against `/data/app.db`, which no longer exists post-Postgres migration. See [infra docs](docs/infra.md) |

## Core Principles (Non-Negotiables)

- **Session auth only** — never suggest JWT or localStorage for auth state
- **Russian UI** — all user-visible strings in Russian with correct declensions; never introduce English-language UI copy
- **Soft-delete everywhere** — `is_deleted=1` (user), `is_deleted=2` (banned). Never hard-delete *rows* — content, media, or the link rows joining them — except notifications (14-day TTL). Stored media *files* are governed separately and may be reclaimed (never deleting a row) when unreachable by every display surface, never published after a safety window, or referenced only by `is_deleted=1` content after a grace period of a few days. Never reclaim files for `is_deleted=2` (unban restores wholesale), for media still referenced by live content or a user's GIF library, or for avatars. Past the grace period restore is text-complete but not media-complete, and that loss must be visible, never a broken image. *(Constitution v4.0.0 §III — governing rule. All three classes are LIVE, see `specs/008-reclaim-unused-media/`. **Caveat**: the deleted-content grace period is clocked from content CREATION, not deletion — no `deleted_at` column exists (spec D3) — so deleting content older than `MEDIA_DELETED_GRACE_DAYS` makes its media reclaimable on the next sweep. Restore is media-complete only for recently *created* content, which is weaker than §III promises.)*
- **Bounded media gallery per post/comment** — an ordered gallery of up to 5 images OR one YouTube embed, never both; backend enforces the cap and the exclusivity, frontend gates as secondary guard. GIFs (uploaded or Giphy-sourced) and video are never part of a gallery — a single GIF or video attachment outside a gallery is unaffected. Galleries are immutable once published (no edit-time add/remove/reorder). *(Constitution v3.0.0. Shipping in stages — Stage 1 shipped, see `specs/006-multi-media-gallery/`; remaining Stage 3 work is reordering pending items while composing only.)*
- **Only reachable image variants exist** — still images get `960`+`1600` (no `320`), animated GIFs get `320`+`960` (no `1600`, they play from `original.gif`); a single-frame GIF in the personal library keeps all three. `960.webp` exists for every kind and is never reclaimed — `media-nginx.conf` degrades any missing WebP variant to it. `buildMedia` must never advertise a variant that was not written. *(Feature 008 US1.)*
- **Single-level comments** — no nested replies; `parent_id` on shouts is legacy/unused
- **Optimistic UI + rollback** — likes, deletes, poll votes update immediately, revert on error
- **One pinned shout max** — admin-managed; prepended only to "new" tab first page
- **Prisma for all DB access** — raw SQL only for migrations or extreme edge cases
- **Zod for all input validation** — schemas in `helpers/validation.js`, shared across routes
- **Design-first, tests second** — design components for correctness and clarity on their own merits; never shape production code primarily for test convenience. A test-only seam is OK only if it doesn't compromise the design. *(Constitution v3.1.0 §VI)*
- **Minimal, meaningful comments** — comments must be sparse and explain the non-obvious (WHY, invariants, gotchas); no comments that restate the code. Prefer self-explanatory names. *(Constitution v3.1.0 §VII)*

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
- **`user_gifs` protects media** — a personal-library GIF is attached to no post, so any reclaim/orphan check consulting only `shout_media`/`comment_media` deletes every user's saved library. Use `hasLiveReference`/`hasAnyReference` in `workers/src/helpers/media-refs.ts`; never open-code the reference check
- **`buildMedia` can return `undefined`** — it does so once `media_meta.reclaimed.files` is true, so the media row outlives its files. Every caller must treat `undefined` as "no media" (`...(media ? { media } : {})`), never assume a DTO; `buildGallery` already filters and collapses below two survivors

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
| Change gallery/attachment behavior | `web/hooks/useMediaAttachments.ts` (shared client state, both composers) + `api/src/helpers/attachments.js` (server-side enforcement, sole writer of `ShoutMedia`/`CommentMedia`) |
| Add a new admin resource | `api/src/admin.js` |
| Add a new background job | `workers/src/jobs/` + register in `workers/src/index.ts` (+ `queues.ts`, `scheduler.ts`) |
| Change which image variants are generated | `api/src/routes/upload.js` + `api/src/routes/gifs.js` (writers) + `api/src/helpers/media.js` — `buildMedia` (DTO) + `web/types.ts` |
| Change media file reclamation | `workers/src/jobs/media-reclaim.ts` (recurring) + `workers/src/helpers/media-refs.ts` (what protects media) + `scripts/reclaim-unreachable-variants.sh` (one-time operator run) |
| Change char counting logic | `api/src/helpers/common.js` + `web/tests/unit/effectiveLength.test.ts` |
| Add a new context provider | Follow order in `web/App.tsx` (see provider order in [web docs](docs/web.md)) |
| Extend search (add type) | `api/src/routes/search.js` — add handler to `searchHandlers` map + Zod enum |

<!-- ESSENTIAL:END -->

## Detailed Documentation

- [API](docs/api.md) — routes, endpoints, DB schema, SSE events, notifications, env vars, backend conventions
- [Web](docs/web.md) — components, contexts, hooks, frontend conventions, mobile/iOS rules, architecture
- [Testing](docs/testing.md) — test setup, fixtures, CI/CD, linting
- [Infrastructure](docs/infra.md) — Docker services, workers/jobs, backup/restore, known tech debt

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
at specs/009-anchor-scroll-restore/plan.md
<!-- SPECKIT END -->
