#!/bin/bash
set -euo pipefail

# Backup Docker volumes (database + media) for Vopli app
# Uses sqlite3 .backup for consistent hot snapshots of the database
# Usage: ./scripts/backup.sh [prod|dev] [--upload]
#   --upload: sync backups to rclone remote (requires rclone configured with "gdrive" remote)

ENV="${1:-prod}"
UPLOAD=false
for arg in "$@"; do
    [ "$arg" = "--upload" ] && UPLOAD=true
done

BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
KEEP=3  # number of recent backups to keep per volume type

RCLONE_REMOTE="gdrive"
RCLONE_PATH="vopli-backups"

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

# --- Database backup: sqlite3 .backup for atomic consistent snapshots ---
echo "Backing up database (sqlite3 .backup)..."
docker compose -f "$COMPOSE_FILE" $ENV_FILE run --rm --no-deps \
    --entrypoint sh \
    -v "$(pwd)/$BACKUP_DIR:/backup" \
    "$SERVICE" -c '
        set -e
        mkdir -p /tmp/db-backup

        if [ -f /data/app.db ]; then
            sqlite3 /data/app.db ".backup /tmp/db-backup/app.db"
            echo "  app.db OK"
        else
            echo "  app.db not found, skipping"
        fi

        if [ -f /data/sessions.sqlite ]; then
            sqlite3 /data/sessions.sqlite ".backup /tmp/db-backup/sessions.sqlite"
            echo "  sessions.sqlite OK"
        else
            echo "  sessions.sqlite not found, skipping"
        fi

        tar czf /backup/'"${PREFIX}-appdata-${TIMESTAMP}"'.tar.gz -C /tmp/db-backup .
        rm -rf /tmp/db-backup
    '

# --- Media backup ---
echo "Backing up media..."
docker compose -f "$COMPOSE_FILE" $ENV_FILE run --rm --no-deps \
    --entrypoint sh \
    -v "$(pwd)/$BACKUP_DIR:/backup" \
    "$SERVICE" -c "tar czf /backup/${PREFIX}-media-${TIMESTAMP}.tar.gz -C /media ."

echo ""
echo "Backup complete:"
ls -lh "$BACKUP_DIR/${PREFIX}-"*"-${TIMESTAMP}.tar.gz"

# --- Rotation: keep only the last $KEEP backups per type ---
echo ""
echo "Rotating old backups (keeping last $KEEP)..."
for TYPE in appdata media; do
    FILES=$(ls -1t "$BACKUP_DIR/${PREFIX}-${TYPE}-"*.tar.gz 2>/dev/null || true)
    COUNT=$(echo "$FILES" | grep -c . || true)
    if [ "$COUNT" -gt "$KEEP" ]; then
        echo "$FILES" | tail -n +"$((KEEP + 1))" | while read -r OLD; do
            echo "  Deleting $OLD"
            rm -f "$OLD"
        done
    fi
done

# --- Upload to cloud via rclone ---
if [ "$UPLOAD" = true ]; then
    if ! command -v rclone &>/dev/null; then
        echo "ERROR: rclone is not installed. Skipping upload."
        echo "  Install: https://rclone.org/install/"
        exit 1
    fi

    echo ""
    echo "Uploading to ${RCLONE_REMOTE}:${RCLONE_PATH}/${PREFIX}/..."
    rclone copy "$BACKUP_DIR/" "${RCLONE_REMOTE}:${RCLONE_PATH}/${PREFIX}/" \
        --include "${PREFIX}-*-${TIMESTAMP}.tar.gz" \
        --progress

    # Rotate remote too: delete old backups beyond $KEEP
    echo "Rotating remote backups (keeping last $KEEP)..."
    for TYPE in appdata media; do
        REMOTE_FILES=$(rclone lsf "${RCLONE_REMOTE}:${RCLONE_PATH}/${PREFIX}/" \
            --include "${PREFIX}-${TYPE}-*.tar.gz" 2>/dev/null | sort -r || true)
        REMOTE_COUNT=$(echo "$REMOTE_FILES" | grep -c . || true)
        if [ "$REMOTE_COUNT" -gt "$KEEP" ]; then
            echo "$REMOTE_FILES" | tail -n +"$((KEEP + 1))" | while read -r OLD; do
                echo "  Deleting remote: $OLD"
                rclone deletefile "${RCLONE_REMOTE}:${RCLONE_PATH}/${PREFIX}/$OLD"
            done
        fi
    done

    echo "Upload complete."
fi

echo ""
echo "To restore, run: ./scripts/restore.sh $ENV $TIMESTAMP"
