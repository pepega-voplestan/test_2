#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PIDFILE="$ROOT/.local-dev.pids"
DATA_DIR="$ROOT/data"
MEDIA_DIR="$ROOT/media"
ENV_FILE="$ROOT/api/.env"

# ── Cleanup any previous run ──
if [ -f "$PIDFILE" ]; then
  echo "[local-dev] Stopping previous session..."
  bash "$ROOT/scripts/local-stop.sh" 2>/dev/null || true
fi

# ── Ensure directories ──
mkdir -p "$DATA_DIR" "$MEDIA_DIR"

# ── Create .env if missing ──
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" << EOF
DATABASE_URL=file:${DATA_DIR}/app.db
SESSION_SECRET=dev-secret-local
NODE_ENV=development
MEDIA_PATH=${MEDIA_DIR}
EOF
  echo "[local-dev] Created $ENV_FILE"
fi

# ── Install deps if needed ──
if [ ! -d "$ROOT/api/node_modules" ]; then
  echo "[local-dev] Installing API dependencies..."
  (cd "$ROOT/api" && npm install)
fi
if [ ! -d "$ROOT/web/node_modules" ]; then
  echo "[local-dev] Installing web dependencies..."
  (cd "$ROOT/web" && npm install)
fi

# ── Run migrations ──
echo "[local-dev] Running database migrations..."
(cd "$ROOT/api" && npx prisma migrate deploy)

# ── Start API server ──
echo "[local-dev] Starting API on :3000..."
(cd "$ROOT/api" && node src/server.js) &
API_PID=$!

# ── Start Vite dev server ──
echo "[local-dev] Starting Vite on :5173..."
(cd "$ROOT/web" && npx vite --host) &
VITE_PID=$!

# ── Save PIDs ──
echo "$API_PID" > "$PIDFILE"
echo "$VITE_PID" >> "$PIDFILE"

echo ""
echo "════════════════════════════════════════"
echo "  API:  http://localhost:3000"
echo "  Web:  http://localhost:5173"
echo "  PIDs: API=$API_PID  Vite=$VITE_PID"
echo "  Stop: bash scripts/local-stop.sh"
echo "════════════════════════════════════════"
echo ""

# ── Wait for both — Ctrl+C kills everything ──
trap "bash \"$ROOT/scripts/local-stop.sh\"; exit 0" INT TERM
wait
