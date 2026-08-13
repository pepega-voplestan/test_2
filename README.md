# Vopley.net

Social network for GAYmers and mentally ill people

**Stack:** React 18 + TypeScript + Vite · Node.js + Express + Prisma + PostgreSQL · BullMQ + Redis · Docker + Nginx

| Directory | Contents |
|-----------|----------|
| `api/` | Express backend, Prisma schema/migrations, AdminJS panel, API tests |
| `web/` | React SPA (contexts, hooks, components) |
| `workers/` | BullMQ background jobs (cleanup, backups, media downgrade) |
| `specs/` | Spec Kit feature specs, plans, tasks |
| `docs/` | Detailed reference documentation |
| `infra/`, `scripts/` | Nginx/Docker config, backup & restore scripts |

## Prerequisites

| Tool | Version | Needed for |
|------|---------|-----------|
| Node.js + npm | 20 | everything (npm ships with Node) |
| Docker + Docker Compose | current | the Docker workflow, `make test-docker` |
| PostgreSQL | 16 | only when running **without** Docker |
| Redis | 7 | only when running **without** Docker |

If you use the Docker workflow you only need Node and Docker — Postgres and Redis run inside containers.

**Ubuntu / Debian**

```sh
# Node 20 (NodeSource — the apt default is too old)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Docker Engine + Compose plugin
sudo apt install -y docker.io docker-compose-v2
sudo usermod -aG docker $USER   # log out and back in, otherwise docker needs sudo

# Only for the non-Docker workflow
sudo apt install -y postgresql-16 redis-server
```

**macOS** (via [Homebrew](https://brew.sh))

```sh
brew install node@20
brew install --cask docker      # then launch Docker Desktop once
brew install postgresql@16 redis # only for the non-Docker workflow
```

**Arch Linux**

```sh
sudo pacman -S nodejs-lts-iron npm docker docker-compose
sudo systemctl enable --now docker
sudo usermod -aG docker $USER   # log out and back in
sudo pacman -S postgresql redis  # only for the non-Docker workflow
```

**Windows** — install [WSL2](https://learn.microsoft.com/windows/wsl/install) plus Docker Desktop with the WSL2 backend, then follow the Ubuntu instructions inside your WSL shell. The `make` targets and shell scripts expect a Unix shell; they will not run in PowerShell or CMD.

Check that everything is in place:

```sh
node -v      # v20.x
docker --version
docker compose version
```

## Setup

```sh
git clone git@github.com:pepega-voplestan/test_2.git && cd test_2
make install                 # root + api + web + workers deps, husky hooks
cp .env.example .env         # then open .env and fill in the secrets
htpasswd -c .htpasswd admin  # asks for a password; nginx needs this for /admin,
                             # and make prod/local refuse to start without it
```

No `htpasswd` command? Install it (`apt install apache2-utils`, `pacman -S apache`) or generate the file with Docker instead:

```sh
docker run --rm httpd:alpine htpasswd -nbB admin YOUR_PASSWORD > .htpasswd
```

`.env` values you must set before the app will start: `DATABASE_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `SESSION_SECRET`. The rest (`RESEND_API_KEY`, `GIPHY_API_KEY`, `ADMIN_*`) only affect the features that use them — email, the GIF picker, and the admin panel. `.env*` and `.htpasswd` are gitignored; never commit them.

### Docker (recommended)

```sh
make local        # builds and starts the whole stack, hot-reload
                  # → http://localhost:3006
make logs-local   # follow logs (Ctrl+C just detaches, containers keep running)
make down-local   # stop
```

The first build takes several minutes; later starts are fast. Local dev uses `docker-compose.local.yml` with `.env.dev` and its own `-dev` volumes, so it never touches production data. Database migrations run automatically when the api container starts.

### Without Docker

You need PostgreSQL and Redis already running, and a database created for the app:

```sh
sudo -u postgres createuser --pwprompt vopley
sudo -u postgres createdb --owner=vopley vopley
```

Point `DATABASE_URL` at it (`postgresql://vopley:PASSWORD@localhost:5432/vopley`) and set `REDIS_HOST`/`REDIS_PORT` if Redis isn't on `localhost:6379`. Then:

```sh
cd api && npx prisma generate && npx prisma migrate deploy
cd ../web && npm run dev     # API on :3000 + Vite on :5173 (proxies /api, /media, /admin)
```

Open http://localhost:5173. Re-run `npx prisma generate` after any change to `api/prisma/schema.prisma`.

**Env file location matters:** `dotenv` resolves `.env` from the working directory. `npm run dev` runs from `web/`, so it reads `web/.env`; running the API alone from `api/` reads `api/.env`.

> `scripts/local-start.sh` and `make db-pull` are stale — they still assume the pre-migration SQLite database. Don't use them.

## Testing

```sh
make test              # API (vitest, sequential)
make test-web          # Web (vitest + jsdom + @testing-library)
make test-all          # both
make test-coverage / make test-web-coverage
make test-docker       # API in Docker with a throwaway Postgres — no local setup needed
```

API tests need a PostgreSQL **test** database; `tests/setup.js` runs `prisma migrate reset --force` against it on every run, so never point it at a real database. `TEST_DATABASE_URL` must be exported in the shell — no `.env` file is loaded for it:

```sh
export TEST_DATABASE_URL="postgresql://vopley_test:test-secret@localhost:6432/vopley_test"
```

Quickest way to get such a database — a throwaway container on port 6432 matching that URL:

```sh
docker run --rm -d --name vopley-test-db -p 6432:5432 \
  -e POSTGRES_USER=vopley_test -e POSTGRES_PASSWORD=test-secret \
  -e POSTGRES_DB=vopley_test postgres:16-alpine
```

> Port 6432 is also what `docker-compose.local.yml` publishes for the local dev database, so the two cannot run at once. If `make local` is up, put the test container on another port (e.g. `-p 6433:5432`) and match `TEST_DATABASE_URL` to it.

Or skip all of it with `make test-docker`, which starts its own disposable database.

Husky hooks: lint on pre-commit, tests on pre-push. CI runs lint + tests on PRs to `main`.

See [docs/testing.md](docs/testing.md) for fixtures, helpers, and what's mocked.

## Development with Spec Kit

Features here are spec-driven with [Spec Kit](https://github.com/github/spec-kit): you write the spec first, an agent turns it into a plan and a task list, and only then is code written. Each feature lives in `specs/NNN-slug/` (`spec.md`, `plan.md`, `tasks.md`, plus `research.md`, `data-model.md`, `contracts/`, `checklists/`). `.specify/memory/constitution.md` holds the project's non-negotiable principles — check it before proposing architectural changes; `CLAUDE.md` summarizes them.

Typical flow, as Claude Code slash commands:

```
/speckit-specify   <description>   # create specs/NNN-slug/spec.md + feature branch
/speckit-clarify                   # resolve underspecified areas back into the spec
/speckit-plan                      # generate plan.md and design artifacts
/speckit-tasks                     # generate dependency-ordered tasks.md
/speckit-analyze                   # cross-check spec/plan/tasks consistency (read-only)
/speckit-implement                 # execute tasks.md
```

Also available: `/speckit-checklist` (custom review checklist), `/speckit-converge` (diff codebase against the spec, append missing tasks), `/speckit-constitution` (amend principles), `/speckit-taskstoissues` (tasks → GitHub issues).

The active feature is tracked in `.specify/feature.json`.

Documentation is edited through the `/docs` command only — never hand-edit `CLAUDE.md` or `docs/*.md`.

## Reference

- [docs/api.md](docs/api.md) — routes, DB schema, SSE events, notifications, env vars
- [docs/web.md](docs/web.md) — components, contexts, hooks, mobile/iOS rules
- [docs/testing.md](docs/testing.md) — test setup, fixtures, CI/CD, linting
- [docs/infra.md](docs/infra.md) — Docker services, workers, backup/restore, tech debt
