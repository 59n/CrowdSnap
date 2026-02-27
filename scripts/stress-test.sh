#!/bin/bash

# Default to a placeholder Event ID if one isn't provided
EVENT_ID=${1:-cmm2o3i1m0000dp7s13fwyewh}
URL="http://localhost:3000/api/upload/$EVENT_ID"
TEST_DIR="/tmp/photo_drop_stress_test"
NUM_IMAGES=500
CONCURRENCY=50

echo "🧪 Starting EXTREME Stress Test Pipeline!"
echo "📍 Target Event ID: $EVENT_ID"
echo "🌐 Target URL: $URL"
echo "💥 Simulating $CONCURRENCY concurrent clients uploading a total of $NUM_IMAGES images..."
echo ""

# Clean up any previous test artifacts
rm -rf "$TEST_DIR"
mkdir -p "$TEST_DIR"

echo "📦 Generating $NUM_IMAGES test files in $TEST_DIR (this may take a few seconds)..."

for i in $(seq 1 $NUM_IMAGES); do
  # This creates a real, parseable PNG image
  echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" | base64 -d > "$TEST_DIR/valid_img_$i.png"
done

echo "🚀 Files generated. Firing $CONCURRENCY concurrent HTTP requests..."
echo "(Only non-200 errors will be printed below to save terminal space)"

# We use 'find' to pipe all 500 files to 'xargs', which maintains exactly 50 parallel curl processes
find "$TEST_DIR" -type f | xargs -n 1 -P $CONCURRENCY -I {} curl -X POST -F "file=@{};type=image/png" "$URL" -s -o /dev/null -w "Status: %{http_code}\n" | awk '$2 != 200 {print}'

echo ""
echo "✅ Extreme stress test completed!"
echo "If you didn't see any 'Status: 500' lines above, the server successfully ingested all $NUM_IMAGES images perfectly!"
