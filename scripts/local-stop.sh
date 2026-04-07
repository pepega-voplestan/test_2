#!/usr/bin/env bash

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PIDFILE="$ROOT/.local-dev.pids"

if [ ! -f "$PIDFILE" ]; then
  echo "[local-dev] No running session found."
  exit 0
fi

echo "[local-dev] Stopping..."
while read -r pid; do
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null
    echo "  Stopped PID $pid"
  fi
done < "$PIDFILE"

rm -f "$PIDFILE"
echo "[local-dev] Done."
