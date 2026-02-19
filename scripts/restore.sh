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

# If no timestamp provided, find the latest backup
if [ -z "$TIMESTAMP" ]; then
    LATEST=$(ls -1 "$BACKUP_DIR/${PREFIX}-appdata-"*.tar.gz 2>/dev/null | sort | tail -n1 || true)
    if [ -z "$LATEST" ]; then
        echo "ERROR: No backups found for $PREFIX in $BACKUP_DIR/"
        exit 1
    fi
    TIMESTAMP=$(echo "$LATEST" | sed "s|.*${PREFIX}-appdata-\(.*\)\.tar\.gz|\1|")
    echo "Using latest backup: $TIMESTAMP"
fi

APPDATA_FILE="$BACKUP_DIR/${PREFIX}-appdata-${TIMESTAMP}.tar.gz"
MEDIA_FILE="$BACKUP_DIR/${PREFIX}-media-${TIMESTAMP}.tar.gz"

# Verify backup files exist
if [ ! -f "$APPDATA_FILE" ]; then
    echo "ERROR: Database backup not found: $APPDATA_FILE"
    exit 1
fi
if [ ! -f "$MEDIA_FILE" ]; then
    echo "ERROR: Media backup not found: $MEDIA_FILE"
    exit 1
fi

echo "=== Restore ($PREFIX) from $TIMESTAMP ==="
echo "  Database: $APPDATA_FILE ($(du -h "$APPDATA_FILE" | cut -f1))"
echo "  Media:    $MEDIA_FILE ($(du -h "$MEDIA_FILE" | cut -f1))"
echo ""

read -p "This will OVERWRITE current data. Continue? [y/N] " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

# Stop running containers to avoid write conflicts
echo "Stopping containers..."
docker compose -f "$COMPOSE_FILE" $ENV_FILE down 2>/dev/null || true

# Restore database: clean /data (remove old WAL/SHM files too), extract clean .db files
echo "Restoring database..."
docker compose -f "$COMPOSE_FILE" $ENV_FILE run --rm --no-deps \
    --entrypoint sh \
    -v "$(pwd)/$BACKUP_DIR:/backup" \
    "$SERVICE" -c "rm -rf /data/* && tar xzf /backup/${PREFIX}-appdata-${TIMESTAMP}.tar.gz -C /data"

# Restore media
echo "Restoring media..."
docker compose -f "$COMPOSE_FILE" $ENV_FILE run --rm --no-deps \
    --entrypoint sh \
    -v "$(pwd)/$BACKUP_DIR:/backup" \
    "$SERVICE" -c "rm -rf /media/* && tar xzf /backup/${PREFIX}-media-${TIMESTAMP}.tar.gz -C /media"

echo ""
echo "Restore complete. Start the app with: make ${ENV}"
