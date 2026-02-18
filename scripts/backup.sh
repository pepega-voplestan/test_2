#!/bin/bash
set -euo pipefail

# Backup Docker volumes (database + media) for Vopli app
# Usage: ./scripts/backup.sh [prod|dev]

ENV="${1:-prod}"
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

if [ "$ENV" = "dev" ]; then
    COMPOSE_FILE="docker-compose.dev.yml"
    ENV_FILE="--env-file .env.dev"
    SERVICE="api-dev"
    PREFIX="dev"
else
    COMPOSE_FILE="docker-compose.yml"
    ENV_FILE=""
    SERVICE="api"
    PREFIX="prod"
fi

mkdir -p "$BACKUP_DIR"

echo "=== Backup ($PREFIX) - $TIMESTAMP ==="

# Use the api service container with volumes already mounted
# --entrypoint sh overrides the default CMD so we don't run migrations/app
# --no-deps avoids starting other services

echo "Backing up database (/data)..."
docker compose -f "$COMPOSE_FILE" $ENV_FILE run --rm --no-deps \
    --entrypoint sh \
    -v "$(pwd)/$BACKUP_DIR:/backup" \
    "$SERVICE" -c "tar czf /backup/${PREFIX}-appdata-${TIMESTAMP}.tar.gz -C /data ."

echo "Backing up media (/media)..."
docker compose -f "$COMPOSE_FILE" $ENV_FILE run --rm --no-deps \
    --entrypoint sh \
    -v "$(pwd)/$BACKUP_DIR:/backup" \
    "$SERVICE" -c "tar czf /backup/${PREFIX}-media-${TIMESTAMP}.tar.gz -C /media ."

echo ""
echo "Backup complete:"
ls -lh "$BACKUP_DIR/${PREFIX}-"*"-${TIMESTAMP}.tar.gz"
echo ""
echo "To restore, run: ./scripts/restore.sh $ENV $TIMESTAMP"
