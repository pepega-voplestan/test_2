#!/bin/bash
set -euo pipefail

# Restore Docker volumes (database + media) for Vopli app
# Usage: ./scripts/restore.sh [prod|dev] [timestamp]
#   timestamp format: YYYYMMDD_HHMMSS
#   If no timestamp, uses the latest backup

ENV="${1:-prod}"
TIMESTAMP="${2:-}"
BACKUP_DIR="./backups"

if [ "$ENV" = "dev" ]; then
    COMPOSE_FILE="docker-compose.local.yml"
    ENV_FILE="--env-file .env.dev"
    PG_SERVICE="postgres-dev"
    MEDIA_SERVICE="api-dev"
    PREFIX="dev"
else
    COMPOSE_FILE="docker-compose.yml"
    ENV_FILE=""
    PG_SERVICE="postgres"
    MEDIA_SERVICE="api"
    PREFIX="prod"
fi

# If no timestamp provided, find the latest backup
if [ -z "$TIMESTAMP" ]; then
    LATEST=$(ls -1 "$BACKUP_DIR/${PREFIX}-db-"*.dump 2>/dev/null | sort | tail -n1 || true)
    if [ -z "$LATEST" ]; then
        echo "ERROR: No backups found for $PREFIX in $BACKUP_DIR/"
        exit 1
    fi
    TIMESTAMP=$(echo "$LATEST" | sed "s|.*${PREFIX}-db-\(.*\)\.dump|\1|")
    echo "Using latest backup: $TIMESTAMP"
fi

DBDUMP_FILE="$BACKUP_DIR/${PREFIX}-db-${TIMESTAMP}.dump"
MEDIA_FILE="$BACKUP_DIR/${PREFIX}-media-${TIMESTAMP}.tar.gz"

if [ ! -f "$DBDUMP_FILE" ]; then
    echo "ERROR: Database backup not found: $DBDUMP_FILE"
    exit 1
fi
if [ ! -f "$MEDIA_FILE" ]; then
    echo "ERROR: Media backup not found: $MEDIA_FILE"
    exit 1
fi

echo "=== Restore ($PREFIX) from $TIMESTAMP ==="
echo "  Database: $DBDUMP_FILE ($(du -h "$DBDUMP_FILE" | cut -f1))"
echo "  Media:    $MEDIA_FILE ($(du -h "$MEDIA_FILE" | cut -f1))"
echo ""

read -p "This will OVERWRITE current data. Continue? [y/N] " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

# Stop all containers
echo "Stopping containers..."
docker compose -f "$COMPOSE_FILE" $ENV_FILE down 2>/dev/null || true

# Start only postgres so we can restore into it
echo "Starting PostgreSQL..."
docker compose -f "$COMPOSE_FILE" $ENV_FILE up -d "$PG_SERVICE"

# Wait for postgres to be ready
echo "Waiting for PostgreSQL to be ready..."
until docker compose -f "$COMPOSE_FILE" $ENV_FILE exec -T "$PG_SERVICE" \
    sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > /dev/null 2>&1; do
    sleep 1
done
echo "  PostgreSQL ready"

# Copy dump into the postgres container and restore
echo "Restoring database..."
PG_CONTAINER=$(docker compose -f "$COMPOSE_FILE" $ENV_FILE ps -q "$PG_SERVICE")
docker cp "$DBDUMP_FILE" "$PG_CONTAINER:/tmp/restore.dump"
docker compose -f "$COMPOSE_FILE" $ENV_FILE exec -T "$PG_SERVICE" \
    sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_restore --clean --if-exists -U "$POSTGRES_USER" -d "$POSTGRES_DB" /tmp/restore.dump'
docker compose -f "$COMPOSE_FILE" $ENV_FILE exec -T "$PG_SERVICE" \
    rm /tmp/restore.dump
echo "  Database restored"

# Restore media (start api/api-dev container briefly with media volume)
echo "Restoring media..."
docker compose -f "$COMPOSE_FILE" $ENV_FILE run --rm --no-deps \
    --entrypoint sh \
    -v "$(pwd)/$BACKUP_DIR:/backup" \
    "$MEDIA_SERVICE" -c "rm -rf /media/* && tar xzf /backup/${PREFIX}-media-${TIMESTAMP}.tar.gz -C /media"
echo "  Media restored"

echo ""
echo "Restore complete. Start the app with: make ${ENV}"
