#!/bin/bash
set -euo pipefail

# Backup Docker volumes (database + media) for Vopli app
# Uses sqlite3 .backup for consistent hot snapshots of the database
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

# Database backup: use sqlite3 .backup for atomic consistent snapshots
# This is safe to run while the app is serving requests (hot backup)
echo "Backing up database (sqlite3 .backup)..."
docker compose -f "$COMPOSE_FILE" $ENV_FILE run --rm --no-deps \
    --entrypoint sh \
    -v "$(pwd)/$BACKUP_DIR:/backup" \
    "$SERVICE" -c '
        set -e
        mkdir -p /tmp/db-backup

        # Atomic backup of main database
        if [ -f /data/app.db ]; then
            sqlite3 /data/app.db ".backup /tmp/db-backup/app.db"
            echo "  app.db OK"
        else
            echo "  app.db not found, skipping"
        fi

        # Atomic backup of session store
        if [ -f /data/sessions.sqlite ]; then
            sqlite3 /data/sessions.sqlite ".backup /tmp/db-backup/sessions.sqlite"
            echo "  sessions.sqlite OK"
        else
            echo "  sessions.sqlite not found, skipping"
        fi

        # Pack into archive
        tar czf /backup/'"${PREFIX}-appdata-${TIMESTAMP}"'.tar.gz -C /tmp/db-backup .
        rm -rf /tmp/db-backup
    '

# Media backup: plain tar (static files, no consistency issues)
echo "Backing up media..."
docker compose -f "$COMPOSE_FILE" $ENV_FILE run --rm --no-deps \
    --entrypoint sh \
    -v "$(pwd)/$BACKUP_DIR:/backup" \
    "$SERVICE" -c "tar czf /backup/${PREFIX}-media-${TIMESTAMP}.tar.gz -C /media ."

echo ""
echo "Backup complete:"
ls -lh "$BACKUP_DIR/${PREFIX}-"*"-${TIMESTAMP}.tar.gz"
echo ""
echo "To restore, run: ./scripts/restore.sh $ENV $TIMESTAMP"
