.PHONY: prod dev down down-dev logs logs-dev rebuild rebuild-dev backup backup-upload backup-dev restore restore-dev deploy deploy-dev db-pull db-pull-dev test test-web test-all test-docker test-coverage test-web-coverage ensure-htpasswd

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

# Start development server (with .env)
dev: ensure-htpasswd
	docker compose -f docker-compose.dev.yml --env-file .env.dev up --build

# Stop prod containers
down:
	docker compose -f docker-compose.yml down

# Stop dev containers
down-dev:
	docker compose -f docker-compose.dev.yml down

# Show logs
logs:
	docker compose -f docker-compose.yml logs -f

# Show logs
logs-dev:
	docker compose -f docker-compose.dev.yml logs -f

# Force rebuild without cache
rebuild:
	docker compose -f docker-compose.yml build --no-cache

# Force rebuild without cache
rebuild-dev:
	docker compose -f docker-compose.dev.yml build --no-cache

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

# Safe redeploy: backup, rebuild, and start development
deploy-dev: ensure-htpasswd
	./scripts/backup.sh dev
	docker compose -f docker-compose.dev.yml --env-file .env.dev up --build -d

# Pull a safe hot-copy of the production database to ./app.db (container must be running)
db-pull:
	docker exec $$(docker compose -f docker-compose.yml ps -q api) sqlite3 /data/app.db ".backup /tmp/app.db.pull"
	docker cp $$(docker compose -f docker-compose.yml ps -q api):/tmp/app.db.pull ./app.db
	docker exec $$(docker compose -f docker-compose.yml ps -q api) rm /tmp/app.db.pull
	@echo "Pulled production database to ./app.db"

# Pull a safe hot-copy of the development database to ./app.db (container must be running)
db-pull-dev:
	docker exec $$(docker compose -f docker-compose.dev.yml ps -q api-dev) sqlite3 /data/app.db ".backup /tmp/app.db.pull"
	docker cp $$(docker compose -f docker-compose.dev.yml ps -q api-dev):/tmp/app.db.pull ./app.db
	docker exec $$(docker compose -f docker-compose.dev.yml ps -q api-dev) rm /tmp/app.db.pull
	@echo "Pulled development database to ./app.db"

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
