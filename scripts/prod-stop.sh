#!/usr/bin/env bash
# Stop the detached production server started by prod-start.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="$ROOT/logs/prod.pid"
PORT="${PORT:-3001}"

if [[ -f "$PID_FILE" ]]; then
  PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "${PID}" ]] && kill -0 "$PID" 2>/dev/null; then
    kill "$PID" 2>/dev/null || true
    # wait a moment, force if needed
    sleep 1
    if kill -0 "$PID" 2>/dev/null; then
      kill -9 "$PID" 2>/dev/null || true
    fi
    echo "Stopped production server (PID $PID)"
  else
    echo "No running process for PID file"
  fi
  rm -f "$PID_FILE"
else
  echo "No PID file at $PID_FILE"
fi

# Cleanup anything still listening on the port
if command -v lsof >/dev/null 2>&1; then
  PIDS="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "${PIDS}" ]]; then
    echo "Also clearing port ${PORT}: ${PIDS}"
    # shellcheck disable=SC2086
    kill $PIDS 2>/dev/null || true
  fi
fi
