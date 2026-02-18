.PHONY: prod dev down logs rebuild

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
