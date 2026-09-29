#!/usr/bin/env bash
# Remount the replica SSD into wedding-web when Docker Desktop's virtiofs bind
# goes stale (EBADF after unplug/replug or sleep). Never recreates when the
# drive is unplugged — the gallery must stay up on primary storage.
set -euo pipefail

export PATH="/usr/local/bin:/opt/homebrew/bin:${HOME}/.docker/bin:/Applications/Docker.app/Contents/Resources/bin:/usr/bin:/bin:${PATH:-}"

# LaunchAgents cannot execute scripts from ~/Desktop (TCC). Install copies
# this file to ~/Library/Application Support/CrowdSnap and sets CROWDSNAP_ROOT.
ROOT="${CROWDSNAP_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ROOT"

LOG_DIR="$ROOT/logs"
STATUS_FILE="$ROOT/data/ssd-status.json"
LOCK_DIR="$LOG_DIR/ssd-watch.lock"
CONTAINER="${SSD_WATCH_CONTAINER:-wedding-web-1}"

mkdir -p "$LOG_DIR" "$ROOT/data"

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  # Steal a lock older than 5 minutes (crashed previous run)
  now="$(date +%s)"
  then="$(stat -f %m "$LOCK_DIR" 2>/dev/null || echo 0)"
  if [ $((now - then)) -lt 300 ]; then
    exit 0
  fi
  rmdir "$LOCK_DIR" 2>/dev/null || rm -rf "$LOCK_DIR"
  mkdir "$LOCK_DIR"
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

replica_path() {
  python3 - "$ROOT" <<'PY'
import json, os, re, sys
root = sys.argv[1]
path = ""
settings = os.path.join(root, "data", "settings.json")
try:
    path = str(json.load(open(settings)).get("STORAGE_REPLICA_PATH") or "").strip()
except Exception:
    path = ""
if not path:
    env = os.path.join(root, ".env")
    try:
        for line in open(env):
            m = re.match(r"^STORAGE_REPLICA_PATH=(.*)$", line.strip())
            if m:
                path = m.group(1).strip().strip('"').strip("'")
                break
    except Exception:
        pass
print(path)
PY
}

CONFIGURED_REPLICA="$(replica_path)"
replica_configured=false
if [ -n "$CONFIGURED_REPLICA" ]; then
  replica_configured=true
fi
REPLICA="${CONFIGURED_REPLICA:-/Volumes/1TB/wedding}"

VOLUME="$(python3 -c 'import re,sys; p=sys.argv[1]; m=re.match(r"^/Volumes/([^/]+)", p); print("/Volumes/"+m.group(1) if m else "")' "$REPLICA")"
if [ -z "$VOLUME" ]; then
  VOLUME="/Volumes/1TB"
fi

host_mounted=false
if [ -d "$VOLUME" ] && df -P "$VOLUME" >/dev/null 2>&1; then
  # df succeeds for a real mount; also require it is not the Mac boot volume
  src="$(df -P "$VOLUME" | awk 'NR==2 {print $6}')"
  if [ "$src" = "$VOLUME" ]; then
    host_mounted=true
  fi
fi

container_running=false
container_reachable=false
if docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -qx true; then
  container_running=true
  if docker exec "$CONTAINER" sh -c "test -d \"$REPLICA\" && test -w \"$REPLICA\"" >/dev/null 2>&1; then
    container_reachable=true
  fi
fi

action="noop"
if $container_running && $host_mounted && ! $container_reachable; then
  action="recreate"
fi

write_status() {
  python3 - "$STATUS_FILE" "$host_mounted" "$container_reachable" "$VOLUME" "$REPLICA" "$action" <<'PY'
import datetime, json, os, sys
path, host, reach, volume, replica, action = sys.argv[1:7]
payload = {
    "hostMounted": host == "true",
    "containerReachable": reach == "true",
    "volumeRoot": volume,
    "replicaPath": replica,
    "action": action,
    "at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
}
tmp = path + ".tmp"
with open(tmp, "w") as f:
    json.dump(payload, f)
    f.write("\n")
os.replace(tmp, path)
PY
}

write_status

mac_free="$(df -kP / 2>/dev/null | awk 'NR==2 {printf "%.2f", $4/1024/1024}')"
ssd_free=""
if $host_mounted; then
  ssd_free="$(df -kP "$VOLUME" 2>/dev/null | awk 'NR==2 {printf "%.2f", $4/1024/1024}')"
fi

eval_alerts() {
  local recreate_failed="${1:-false}"
  python3 "$ROOT/scripts/brrr-alert.py" eval-host \
    --root "$ROOT" \
    --container-running "$container_running" \
    --recreate-failed "$recreate_failed" \
    --mac-free "${mac_free:-}" \
    --ssd-free "${ssd_free:-}" \
    --host-mounted "$host_mounted" \
    --container-reachable "$container_reachable" \
    --replica-configured "$replica_configured" \
    >/dev/null || true
}

eval_alerts false

if [ "$action" != "recreate" ]; then
  exit 0
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') SSD bind stale (host $VOLUME mounted, container cannot write $REPLICA) — recreating $CONTAINER with SSD overlay"
if ! docker compose \
  -f "$ROOT/docker-compose.yml" \
  -f "$ROOT/docker-compose.ssd.yml" \
  up -d --force-recreate --no-deps web; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') ERROR: docker compose recreate web failed"
  eval_alerts true
  exit 1
fi

# Re-probe after remount
container_reachable=false
if docker exec "$CONTAINER" sh -c "test -d \"$REPLICA\" && test -w \"$REPLICA\"" >/dev/null 2>&1; then
  container_reachable=true
fi
action="noop"
write_status
eval_alerts false
if $container_reachable; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') SSD replica reachable at $REPLICA"
else
  echo "$(date '+%Y-%m-%d %H:%M:%S') WARNING: recreated web but $REPLICA still not writable"
fi
