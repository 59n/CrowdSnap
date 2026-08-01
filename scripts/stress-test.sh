#!/usr/bin/env bash
# Simulate concurrent guest uploads against a live CrowdSnap server.
# Honors HTTP 429 + Retry-After (same idea as the guest browser client).
#
# Usage:
#   ./scripts/stress-test.sh <EVENT_ID> [base_url] [num_images] [concurrency]
#
# Examples:
#   ./scripts/stress-test.sh cmsaf17js0000xon627bv0n9v
#   ./scripts/stress-test.sh cmsaf17js0000xon627bv0n9v https://foto.thenas.us 200 50
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
  echo "  concurrency  Parallel uploads (default: 50)"
  echo ""
  echo "Env: MAX_RETRIES=5  (retries per file on 429)"
  exit 1
fi

URL="${BASE_URL%/}/api/upload/${EVENT_ID}"
TEST_DIR="${TMPDIR:-/tmp}/crowdsnap_stress_$$"
mkdir -p "$TEST_DIR"
trap 'rm -rf "$TEST_DIR"' EXIT

echo "🧪 CrowdSnap upload stress test"
echo "   Event:       $EVENT_ID"
echo "   URL:         $URL"
echo "   Images:      $NUM_IMAGES"
echo "   Concurrency: $CONCURRENCY"
echo "   429 retries: $MAX_RETRIES per file (uses Retry-After)"
echo ""

# Minimal valid 1×1 PNG (real magic bytes)
PNG_B64="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
echo "📦 Generating $NUM_IMAGES PNG files…"
for i in $(seq 1 "$NUM_IMAGES"); do
  echo "$PNG_B64" | base64 -d > "$TEST_DIR/img_$i.png"
done

UPLOAD_ONE="$TEST_DIR/upload_one.sh"
cat > "$UPLOAD_ONE" << 'EOS'
#!/usr/bin/env bash
set -euo pipefail
FILE="$1"
URL="$2"
MAX_RETRIES="$3"
DEVICE="stress-$(date +%s)-$RANDOM"
attempt=0
while true; do
  # Capture body + headers
  RESP=$(curl -sS -D - -o /tmp/cs_body_$$ -X POST \
    -F "file=@${FILE};type=image/png" \
    -H "x-device-id: ${DEVICE}" \
    "$URL" || true)
  CODE=$(printf '%s' "$RESP" | head -n 1 | awk '{print $2}')
  RETRY=$(printf '%s' "$RESP" | awk 'BEGIN{IGNORECASE=1} /^Retry-After:/ {print $2}' | tr -d '\r')

  if [[ "$CODE" == "200" ]]; then
    echo "200"
    exit 0
  fi

  if [[ "$CODE" == "429" && "$attempt" -lt "$MAX_RETRIES" ]]; then
    attempt=$((attempt + 1))
    WAIT="${RETRY:-5}"
    # clamp
    if ! [[ "$WAIT" =~ ^[0-9]+$ ]]; then WAIT=5; fi
    if [[ "$WAIT" -gt 120 ]]; then WAIT=120; fi
    if [[ "$WAIT" -lt 1 ]]; then WAIT=1; fi
    sleep "$WAIT"
    continue
  fi

  echo "${CODE:-000}"
  exit 0
done
EOS
chmod +x "$UPLOAD_ONE"

echo "🚀 Uploading with $CONCURRENCY parallel clients (auto-retry on 429)…"
RESULTS="$TEST_DIR/results.txt"
: > "$RESULTS"

find "$TEST_DIR" -name 'img_*.png' -print0 \
  | xargs -0 -n 1 -P "$CONCURRENCY" -I {} \
    bash "$UPLOAD_ONE" {} "$URL" "$MAX_RETRIES" \
  >> "$RESULTS" || true

OK=$(grep -c '^200$' "$RESULTS" 2>/dev/null || echo 0)
FAIL=$(grep -cv '^200$' "$RESULTS" 2>/dev/null || echo 0)
TOTAL=$(wc -l < "$RESULTS" | tr -d ' ')

echo ""
echo "✅ Done"
echo "   Total responses: $TOTAL"
echo "   Success (200):   $OK"
echo "   Failed:          $FAIL"
if [[ "${FAIL:-0}" != "0" ]]; then
  echo "   Status breakdown:"
  sort "$RESULTS" | uniq -c | sort -rn
  echo ""
  echo "Tip: 429 after all retries = still over limit (raise UPLOAD_RATE_PER_IP or lower concurrency)"
  echo "     403 = event closed / not active"
  echo "     507 = storage full"
fi
