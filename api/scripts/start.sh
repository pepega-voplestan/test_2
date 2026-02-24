#!/bin/sh
set -e

# Regenerate Prisma Client so it matches the current schema
# (needed in dev when prisma/ is mounted from host with newer models than the image)
npx prisma generate

# Attempt normal migration deploy
OUTPUT=$(npx prisma migrate deploy 2>&1) && echo "$OUTPUT" || {
  EXIT_CODE=$?
  # P3005 = database schema is not empty (existing pre-Prisma database)
  if echo "$OUTPUT" | grep -q "P3005"; then
    echo "[Start] Existing database detected, resolving baseline migration..."
    npx prisma migrate resolve --applied 0001_baseline
    npx prisma migrate deploy
  # P3009 = a previous migration run left a failed migration record in _prisma_migrations
  elif echo "$OUTPUT" | grep -q "P3009"; then
    FAILED=$(echo "$OUTPUT" | grep "migration started at" | sed "s/.*\`\([^\`]*\)\` migration started.*/\1/")
    if [ -n "$FAILED" ]; then
      echo "[Start] Failed migration detected ($FAILED), marking as rolled-back and retrying..."
      npx prisma migrate resolve --rolled-back "$FAILED"
      npx prisma migrate deploy
    else
      echo "$OUTPUT"
      exit $EXIT_CODE
    fi
  else
    echo "$OUTPUT"
    exit $EXIT_CODE
  fi
}

exec npm start
