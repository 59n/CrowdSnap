#!/usr/bin/env bash
# Start CrowdSnap production server detached (survives closing the terminal).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT="${PORT:-3001}"
HOST="${HOST:-0.0.0.0}"
LOG_DIR="$ROOT/logs"
PID_FILE="$LOG_DIR/prod.pid"
LOG_FILE="$LOG_DIR/prod.log"

mkdir -p "$LOG_DIR"

if [[ -f "$PID_FILE" ]]; then
  OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "${OLD_PID}" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "Already running (PID $OLD_PID) on port ${PORT}"
    echo "  logs: $LOG_FILE"
    echo "  stop: npm run prod:stop"
    exit 0
  fi
  rm -f "$PID_FILE"
fi

# Free port if a stray next process is bound
if command -v lsof >/dev/null 2>&1; then
  PIDS="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "${PIDS}" ]]; then
    echo "Port ${PORT} in use by: ${PIDS} — stopping those processes"
    # shellcheck disable=SC2086
    kill $PIDS 2>/dev/null || true
    sleep 1
  fi
fi

export NODE_ENV=production
nohup npx next start -H "$HOST" -p "$PORT" >>"$LOG_FILE" 2>&1 &
echo $! >"$PID_FILE"

sleep 1
if kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "CrowdSnap production started"
  echo "  URL:  http://localhost:${PORT}"
  echo "  PID:  $(cat "$PID_FILE")"
  echo "  logs: $LOG_FILE"
  echo "  stop: npm run prod:stop"
else
  echo "Failed to start — see $LOG_FILE"
  rm -f "$PID_FILE"
  exit 1
fi
