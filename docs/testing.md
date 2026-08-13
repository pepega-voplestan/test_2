# Testing Reference

## Commands

```sh
make test              # API unit + integration (cd api && npm test)
make test-web          # Web tests (cd web && npm test)
make test-workers      # Workers tests (cd workers && npm test)
make test-all          # All three sequentially
make test-coverage     # API v8 coverage → api/coverage/
make test-web-coverage # Web v8 coverage → web/coverage/
make test-docker       # API in Docker (docker-compose.test.yml)
```

## API Tests (`api/tests/`)

Run sequentially.

- `setup.js` — globalSetup: requires `TEST_DATABASE_URL`; runs `prisma migrate reset --force` against PostgreSQL test DB; writes temp `.env.test`
- `env.js` — setupFiles: loads `.env.test` into `process.env`
- `helpers.js` — `getApp()` (lazy import), `request()` (supertest), `authenticatedAgent(user)` (session cookie), `cleanDb()`, `disconnectDb()`
- `fixtures/index.js` — `createUser()`, `createShout()`, `createComment()`, `createPoll()`, `createPollVote()`, `createIgnoredUser()`, `createSocial()`. Users have `_rawPassword` for auth in tests.

**Mocked in tests:** `email.js` (no-op), `sse.js` (no-op, prevents heartbeat leak), `admin.js` (no-op, skips AdminJS init)

**Coverage:** v8, `src/**/*.js`, excludes `server.js`/`swagger.js`, reports to `api/coverage/`

**Test suites:**
- `unit/` — auth, admin, common, email, media, mentions, socials, sse, validation, app.setup
- `integration/` — health, auth, shouts, comments, likes, announcements, notifications, feed, upload, users, polls, socials, index

## Web Tests (`web/`)

jsdom + @testing-library/react.

- `tests/helpers.tsx` — `renderWithProviders()` wraps all context providers
- Context tests (co-located): AuthContext, ThemeContext, NotificationsContext, ContentPreferencesContext, IgnoredUsersContext
- Hook tests (co-located): useRoute (hash routing), useSSE (reconnect, backoff 1s→30s), useMentionUsers (lazy load, module-level cache)
- Unit: `effectiveLength.test.ts` — char counting, mention normalization (`@[name:id]`→`@name`), spoiler stripping (`||…||`), newline cost (40 chars each)
- Coverage: `components/**`, `context/**`, `hooks/**`

**Note:** `components/` directory has no test files (contexts + hooks are covered).

## Workers Tests (`workers/tests/`)

Vitest, no jsdom. Every job takes its dependencies by injection (`db`, `fileSystem`, clock, grace periods), so the suite needs neither PostgreSQL nor Redis — the fakes are plain in-memory objects, including a `dirs`-backed filesystem and an `updateMany` that reproduces Prisma's compare-and-set semantics.

- `original-downgrade.test.ts` — the 24h original-quality sweep
- `reclaim.test.ts` — the shared removal mechanism: survivor verification, marker-before-unlink ordering, dry run, concurrent-modification
- `media-refs.test.ts` — what protects media from reclaim, including the personal GIF library and ban-removed content
- `media-reclaim.test.ts` — the daily never-published sweep, its protections, and cursor batching

`notification-cleanup` and `db-backup` are untested.

## Git Hooks (Husky)

- **Pre-commit**: `npm run lint` for api and web
- **Pre-push**: `npm test` for api and web

Neither hook covers `workers/` — CI does.

## CI/CD

**CI** (`.github/workflows/ci.yml`): on PRs to main — install deps for api/web/workers, generate the Prisma client for api and workers, then lint and test all three.

**Deploy** (`.github/workflows/docker.yml`): manual `workflow_dispatch` — build + push images to GHCR, deploy via SSH.

## Linting

| Package | Config |
|---------|--------|
| `api/` | `@eslint/js` recommended; Node globals; `console.*` allowed; `_`-prefix unused vars |
| `web/` | `typescript-eslint` recommended; `react-hooks` rules; `no-explicit-any` = warn; `_`-prefix unused vars |
