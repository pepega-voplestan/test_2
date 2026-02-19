.PHONY: prod dev down down-dev logs logs-dev rebuild rebuild-dev backup backup-upload backup-dev restore restore-dev deploy deploy-dev

# Start production server
prod:
	docker-compose -f docker-compose.yml up --build

# Start development server (with .env)
dev:
	docker-compose -f docker-compose.dev.yml --env-file .env.dev up --build

# Stop prod containers
down:
	docker-compose -f docker-compose.yml down

# Stop dev containers
down-dev:
	docker-compose -f docker-compose.dev.yml down

# Show logs
logs:
	docker-compose -f docker-compose.yml logs -f

# Show logs
logs-dev:
	docker-compose -f docker-compose.dev.yml logs -f

# Force rebuild without cache
rebuild:
	docker-compose -f docker-compose.yml build --no-cache

# Force rebuild without cache
rebuild-dev:
	docker-compose -f docker-compose.dev.yml build --no-cache

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
deploy:
	./scripts/backup.sh prod
	docker-compose -f docker-compose.yml up --build -d

# Safe redeploy: backup, rebuild, and start development
deploy-dev:
	./scripts/backup.sh dev
	docker-compose -f docker-compose.dev.yml --env-file .env.dev up --build -d
