#!/usr/bin/env bash
# Launch N parallel stress-test workers (heavier multi-wave load).
#
# Usage:
#   ./scripts/stress-test-runner.sh <EVENT_ID> [base_url] [workers] [images_per_worker] [concurrency]
#
# Example (~50 parallel clients, 10 workers × 50 images each = 500 uploads):
#   ./scripts/stress-test-runner.sh cmsad263r0000wnn6fp5kbj6i http://localhost:3001 10 50 50
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EVENT_ID="${1:-}"
BASE_URL="${2:-http://localhost:3001}"
WORKERS="${3:-10}"
IMAGES="${4:-50}"
CONCURRENCY="${5:-50}"

if [[ -z "$EVENT_ID" ]]; then
  echo "Usage: $0 <EVENT_ID> [base_url] [workers] [images_per_worker] [concurrency]"
  exit 1
fi

echo "🔥 Multi-wave stress: ${WORKERS} workers × ${IMAGES} images (concurrency ${CONCURRENCY})"
echo "   Target: ${BASE_URL}  event=${EVENT_ID}"
echo ""

PIDS=()
for i in $(seq 1 "$WORKERS"); do
  bash "$ROOT/scripts/stress-test.sh" "$EVENT_ID" "$BASE_URL" "$IMAGES" "$CONCURRENCY" &
  PIDS+=($!)
  echo "  worker $i started (pid ${PIDS[-1]})"
done

FAIL=0
for pid in "${PIDS[@]}"; do
  if ! wait "$pid"; then
    FAIL=$((FAIL + 1))
  fi
done

echo ""
if [[ "$FAIL" -eq 0 ]]; then
  echo "✅ All workers finished"
else
  echo "⚠️  $FAIL worker(s) exited non-zero"
fi
