.PHONY: prod local down down-local logs logs-local rebuild rebuild-local backup backup-upload backup-dev restore restore-dev deploy deploy-local db-pull db-pull-local test test-web test-all test-docker test-coverage test-web-coverage ensure-htpasswd install

# Ensure .htpasswd exists (nginx auth_basic requires a valid file, otherwise /admin returns 500)
ensure-htpasswd:
	@if [ ! -f .htpasswd ]; then \
		echo "ERROR: .htpasswd file not found. Nginx requires it for /admin basic auth."; \
		echo "Create it with: htpasswd -c .htpasswd USERNAME"; \
		echo "Or without htpasswd: docker run --rm httpd:alpine htpasswd -nbB USERNAME PASSWORD > .htpasswd"; \
		exit 1; \
	fi

# Start production server
prod: ensure-htpasswd
	docker compose -f docker-compose.yml up --build

# Start local development server (hot-reload, bind mounts)
local: ensure-htpasswd
	docker compose -f docker-compose.local.yml --env-file .env.dev up --build

# Stop prod containers
down:
	docker compose -f docker-compose.yml down

# Stop local containers
down-local:
	docker compose -f docker-compose.local.yml down

# Show logs
logs:
	docker compose -f docker-compose.yml logs -f

# Show logs (local)
logs-local:
	docker compose -f docker-compose.local.yml logs -f

# Force rebuild without cache
rebuild:
	docker compose -f docker-compose.yml build --no-cache

# Force rebuild without cache (local)
rebuild-local:
	docker compose -f docker-compose.local.yml build --no-cache

# Backup production volumes (database + media)
backup:
	./scripts/backup.sh prod

# Backup production + upload to Google Drive
backup-upload:
	./scripts/backup.sh prod --upload

# Backup development volumes (database + media)
backup-dev:
	./scripts/backup.sh dev

# Restore production volumes from latest (or specify TIMESTAMP=YYYYMMDD_HHMMSS)
restore:
	./scripts/restore.sh prod $(TIMESTAMP)

# Restore development volumes from latest (or specify TIMESTAMP=YYYYMMDD_HHMMSS)
restore-dev:
	./scripts/restore.sh dev $(TIMESTAMP)

# Safe redeploy: backup, rebuild, and start production
deploy: ensure-htpasswd
	./scripts/backup.sh prod
	docker compose -f docker-compose.yml up --build -d

# Safe redeploy: backup, rebuild, and start local
deploy-local: ensure-htpasswd
	./scripts/backup.sh dev
	docker compose -f docker-compose.local.yml --env-file .env.dev up --build -d

# Pull a pg_dump of the production database (container must be running)
db-pull:
	@mkdir -p ./api/dev.dbdata
	docker compose -f docker-compose.yml exec -T postgres \
		sh -c 'PGPASSWORD="$$POSTGRES_PASSWORD" pg_dump -U "$$POSTGRES_USER" -Fc "$$POSTGRES_DB"' \
		> ./api/dev.dbdata/prod-$$(date +%Y%m%d_%H%M%S).dump
	@echo "Pulled production database to ./api/dev.dbdata/"

# Pull a pg_dump of the local database (container must be running)
db-pull-local:
	@mkdir -p ./api/dev.dbdata
	docker compose -f docker-compose.local.yml --env-file .env.dev exec -T postgres-dev \
		sh -c 'PGPASSWORD="$$POSTGRES_PASSWORD" pg_dump -U "$$POSTGRES_USER" -Fc "$$POSTGRES_DB"' \
		> ./api/dev.dbdata/local-$$(date +%Y%m%d_%H%M%S).dump
	@echo "Pulled local database to ./api/dev.dbdata/"

# Run API tests locally
test:
	cd api && npm test

# Run web tests locally
test-web:
	cd web && npm test

# Run all tests (API + web)
test-all:
	cd api && npm test
	cd web && npm test

# Run API tests in Docker
test-docker:
	docker compose -f docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from api-test

# Run API tests with coverage locally
test-coverage:
	cd api && npm run test:coverage

# Run web tests with coverage locally
test-web-coverage:
	cd web && npm run test:coverage

# Install all dependencies (root + api + web + workers) and set up git hooks
install:
	npm install
	cd api && npm install
	cd web && npm install
	cd workers && npm install
