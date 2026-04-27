#!/bin/bash
set -euo pipefail

# Backup Docker volumes (database + media) for Vopli app
# Uses pg_dump for consistent hot snapshots of the PostgreSQL database
# Usage: ./scripts/backup.sh [prod|dev] [--upload]
#   --upload: sync backups to rclone remote (requires rclone configured with "gdrive" remote)

ENV="${1:-prod}"
UPLOAD=false
for arg in "$@"; do
    [ "$arg" = "--upload" ] && UPLOAD=true
done

BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
KEEP=3  # number of recent backups to keep per type

RCLONE_REMOTE="gdrive"
RCLONE_PATH="vopli-backups"

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

mkdir -p "$BACKUP_DIR"

echo "=== Backup ($PREFIX) - $TIMESTAMP ==="

# --- Database backup: pg_dump custom format (compressed binary) ---
echo "Backing up database (pg_dump)..."
docker compose -f "$COMPOSE_FILE" $ENV_FILE exec -T "$PG_SERVICE" \
    sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' \
    > "$BACKUP_DIR/${PREFIX}-db-${TIMESTAMP}.dump"
echo "  pg_dump OK"

# --- Media backup ---
echo "Backing up media..."
docker compose -f "$COMPOSE_FILE" $ENV_FILE run --rm --no-deps \
    --entrypoint sh \
    -v "$(pwd)/$BACKUP_DIR:/backup" \
    "$MEDIA_SERVICE" -c "tar czf /backup/${PREFIX}-media-${TIMESTAMP}.tar.gz -C /media ."

echo ""
echo "Backup complete:"
ls -lh "$BACKUP_DIR/${PREFIX}-db-${TIMESTAMP}.dump" \
        "$BACKUP_DIR/${PREFIX}-media-${TIMESTAMP}.tar.gz"

# --- Rotation: keep only the last $KEEP backups per type ---
echo ""
echo "Rotating old backups (keeping last $KEEP)..."
for PATTERN in "${PREFIX}-db-*.dump" "${PREFIX}-media-*.tar.gz"; do
    FILES=$(ls -1t "$BACKUP_DIR/"$PATTERN 2>/dev/null || true)
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
        --include "${PREFIX}-*-${TIMESTAMP}.*" \
        --include "${PREFIX}-db-${TIMESTAMP}.dump" \
        --progress

    # Rotate remote: delete old backups beyond $KEEP
    echo "Rotating remote backups (keeping last $KEEP)..."
    for PATTERN in "db" "media"; do
        if [ "$PATTERN" = "db" ]; then
            GLOB="${PREFIX}-db-*.dump"
        else
            GLOB="${PREFIX}-media-*.tar.gz"
        fi
        REMOTE_FILES=$(rclone lsf "${RCLONE_REMOTE}:${RCLONE_PATH}/${PREFIX}/" \
            --include "$GLOB" 2>/dev/null | sort -r || true)
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
