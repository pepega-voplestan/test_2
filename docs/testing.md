# Testing Reference

## Commands

```sh
make test              # API unit + integration (cd api && npm test)
make test-web          # Web tests (cd web && npm test)
make test-all          # Both sequentially
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

**Note:** `components/` directory has no test files (contexts + hooks are covered). `workers/` has no test suite.

## Git Hooks (Husky)

- **Pre-commit**: `npm run lint` for api and web
- **Pre-push**: `npm test` for api and web

## CI/CD

**CI** (`.github/workflows/ci.yml`): on PRs to main — install deps, generate Prisma client, lint both, test both.

**Deploy** (`.github/workflows/docker.yml`): manual `workflow_dispatch` — build + push images to GHCR, deploy via SSH.

## Linting

| Package | Config |
|---------|--------|
| `api/` | `@eslint/js` recommended; Node globals; `console.*` allowed; `_`-prefix unused vars |
| `web/` | `typescript-eslint` recommended; `react-hooks` rules; `no-explicit-any` = warn; `_`-prefix unused vars |
