#!/bin/bash

echo "🔥 Starting 50 CONCURRENT instances of the Extreme Stress Test..."
echo "This will upload 25,000 images total (500 images * 50 clients)."
echo "Expect heavy CPU and Database usage."

for i in {1..50}; do
  # Run the stress test in the background, suppressing its internal output to avoid console spam
  ./scripts/stress-test.sh > /dev/null 2>&1 &
done

echo "⏳ All 50 instances dispatched. Waiting for them to finish..."
wait

echo "✅ All 50 concurrent stress tests completed!"
