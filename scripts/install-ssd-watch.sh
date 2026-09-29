#!/usr/bin/env bash
# Install a per-user LaunchAgent that remounts the replica SSD bind when it goes stale.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="us.thenas.crowdsnap.ssd-watch"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
APP_DIR="$HOME/Library/Application Support/CrowdSnap"
WATCH="$APP_DIR/ssd-watch.sh"
LOG="$ROOT/logs/ssd-watch.log"
UID_NUM="$(id -u)"

mkdir -p "$HOME/Library/LaunchAgents" "$ROOT/logs" "$APP_DIR"
# macOS blocks LaunchAgents from executing files under Desktop; run a copy.
cp "$ROOT/scripts/ssd-watch.sh" "$WATCH"
chmod +x "$WATCH" "$ROOT/scripts/brrr-alert.py"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${WATCH}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>CROWDSNAP_ROOT</key>
    <string>${ROOT}</string>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:${HOME}/.docker/bin:/Applications/Docker.app/Contents/Resources/bin:/usr/bin:/bin</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>StartInterval</key>
  <integer>60</integer>
  <key>WatchPaths</key>
  <array>
    <string>/Volumes</string>
  </array>
  <key>StandardOutPath</key>
  <string>${LOG}</string>
  <key>StandardErrorPath</key>
  <string>${LOG}</string>
</dict>
</plist>
EOF

launchctl bootout "gui/${UID_NUM}/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/${UID_NUM}" "$PLIST"
launchctl kickstart -k "gui/${UID_NUM}/${LABEL}"

echo "Installed LaunchAgent ${LABEL}"
echo "  plist: $PLIST"
echo "  log:   $LOG"
echo "  stop:  launchctl bootout gui/${UID_NUM}/${LABEL}"
