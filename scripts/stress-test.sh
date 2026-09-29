#!/usr/bin/env bash
# Simulate concurrent guest uploads against a live CrowdSnap server.
# Honors HTTP 429 + Retry-After (same idea as the guest browser client).
#
# Usage:
#   ./scripts/stress-test.sh <EVENT_ID> [base_url] [num_images] [concurrency]
#
# Examples:
#   ./scripts/stress-test.sh cmsaf17js0000xon627bv0n9v
#   ./scripts/stress-test.sh cmsaf17js0000xon627bv0n9v https://wedding.example.com 200 50
#
set -euo pipefail

EVENT_ID="${1:-}"
BASE_URL="${2:-http://localhost:3001}"
NUM_IMAGES="${3:-200}"
CONCURRENCY="${4:-50}"
MAX_RETRIES="${MAX_RETRIES:-5}"

if [[ -z "$EVENT_ID" ]]; then
  echo "Usage: $0 <EVENT_ID> [base_url] [num_images] [concurrency]"
  echo ""
  echo "  EVENT_ID     Active event id (must be open for guests)"
  echo "  base_url     Default: http://localhost:3001"
  echo "  num_images   Default: 200"
  echo "  concurrency  Default: 50"
  echo ""
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE="$SCRIPT_DIR/fixtures/sample.jpg"

if [[ ! -f "$FIXTURE" ]]; then
  echo "Creating fixture image at $FIXTURE..."
  mkdir -p "$SCRIPT_DIR/fixtures"
  # Generate a minimal valid 100x100 JPEG using python
  python3 -c "
import struct
# Minimal 1x1 JPEG bytes
jpg = bytes([
  0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
  0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
  0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
  0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
  0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
  0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
  0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00,
  0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
  0x09, 0x0A, 0x0B, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F,
  0x00, 0xBF, 0x80, 0xFF, 0xD9
])
with open('$FIXTURE', 'wb') as f:
  f.write(jpg)
"
fi

UPLOAD_URL="$BASE_URL/api/upload/$EVENT_ID"
echo "=== CrowdSnap Stress Test ==="
echo "Target:      $UPLOAD_URL"
echo "Total imgs:  $NUM_IMAGES"
echo "Concurrency: $CONCURRENCY"
echo "============================="

# Ensure target is reachable
HTTP_CHECK=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/p/$EVENT_ID" || true)
if [[ "$HTTP_CHECK" != "200" ]]; then
  echo "WARNING: Event page returned HTTP $HTTP_CHECK (expected 200). Continuing anyway..."
fi

START_TIME=$(date +%s)
SUCCESS_COUNT=0
FAIL_COUNT=0
RATE_LIMITED_COUNT=0

upload_one() {
  local idx="$1"
  local dev_id="stress-device-$((idx % 10))"
  local attempt=0
  local wait_sec=1

  while (( attempt < MAX_RETRIES )); do
    attempt=$((attempt + 1))
    
    # Send request and capture HTTP code + response body
    local resp
    resp=$(curl -s -w "\n%{http_code}" \
      -F "file=@$FIXTURE;filename=stress_${idx}.jpg;type=image/jpeg" \
      -H "x-device-id: $dev_id" \
      "$UPLOAD_URL" 2>&1)
    
    local code
    code=$(echo "$resp" | tail -n1)
    local body
    body=$(echo "$resp" | head -n -1)

    if [[ "$code" == "200" || "$code" == "201" ]]; then
      echo "OK"
      return 0
    elif [[ "$code" == "429" ]]; then
      # Extract retry-after or backoff exponentially
      local retry_after
      retry_after=$(echo "$body" | grep -o '"retryAfter":[0-9]*' | cut -d: -f2 || true)
      if [[ -n "$retry_after" && "$retry_after" -gt 0 ]]; then
        wait_sec="$retry_after"
      else
        wait_sec=$((wait_sec * 2))
      fi
      sleep "$wait_sec"
    else
      # Other client/server error
      sleep 1
    fi
  done

  echo "FAIL"
  return 1
}

export -f upload_one
export UPLOAD_URL FIXTURE MAX_RETRIES

# Run with xargs concurrency
RESULTS=$(seq 1 "$NUM_IMAGES" | xargs -n 1 -P "$CONCURRENCY" bash -c 'upload_one "$@"' _)

SUCCESS_COUNT=$(echo "$RESULTS" | grep -c "OK" || true)
FAIL_COUNT=$(echo "$RESULTS" | grep -c "FAIL" || true)

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
if (( DURATION == 0 )); then DURATION=1; fi
RPS=$((SUCCESS_COUNT / DURATION))

echo ""
echo "=== Test Results ==="
echo "Duration:      ${DURATION}s"
echo "Successful:    $SUCCESS_COUNT / $NUM_IMAGES"
echo "Failed:        $FAIL_COUNT"
echo "Throughput:    ~${RPS} uploads/sec"
echo "===================="

if (( FAIL_COUNT > 0 )); then
  exit 1
fi
