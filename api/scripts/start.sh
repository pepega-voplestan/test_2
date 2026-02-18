#!/bin/sh
set -e

# Attempt normal migration deploy
OUTPUT=$(npx prisma migrate deploy 2>&1) && echo "$OUTPUT" || {
  EXIT_CODE=$?
  # P3005 = database schema is not empty (existing pre-Prisma database)
  if echo "$OUTPUT" | grep -q "P3005"; then
    echo "[Start] Existing database detected, resolving baseline migration..."
    npx prisma migrate resolve --applied 0001_baseline
    npx prisma migrate deploy
  else
    echo "$OUTPUT"
    exit $EXIT_CODE
  fi
}

exec npm start
