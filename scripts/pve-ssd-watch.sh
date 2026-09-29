#!/usr/bin/env bash
# Run on the Proxmox host. Report the physical mount and repair a stale Docker
# bind in CT 104 without stopping the CT or its database.
set -euo pipefail

CT_ID=104
ROOT=/opt/homelab/docker/crowdsnap
MOUNT=/mnt/wedding-ssd
REPLICA=$MOUNT/wedding
UUID=c05a60a7-a6b4-4cce-9c42-f171024177ec
CONTAINER=crowdsnap-web-1
STATUS=/tmp/crowdsnap-ssd-status-$$.json
trap 'rm -f "$STATUS"' EXIT

if [ "$(findmnt -n -o UUID -T "$MOUNT" 2>/dev/null || true)" != "$UUID" ] &&
   [ -e "/dev/disk/by-uuid/$UUID" ]; then
  mount "$MOUNT" 2>/dev/null || true
fi

host_mounted=false
if [ "$(findmnt -n -o UUID -T "$MOUNT" 2>/dev/null || true)" = "$UUID" ] &&
   python3 - "$REPLICA" <<'PY'
import os, sys, tempfile
try:
    with tempfile.NamedTemporaryFile(prefix='.crowdsnap-probe-', dir=sys.argv[1]) as f:
        f.write(b'ok')
        f.flush()
        os.fsync(f.fileno())
except OSError:
    sys.exit(1)
PY
then
  host_mounted=true
fi

container_running=false
container_reachable=false
ct_reachable=false
action=noop
probe_container() {
  pct exec "$CT_ID" -- docker exec "$CONTAINER" node -e '
    const fs = require("fs"), path = require("path"), crypto = require("crypto");
    const replica = "/mnt/wedding-ssd/wedding", primary = "/app/storage";
    const probe = path.join(replica, `.crowdsnap-probe-${crypto.randomUUID()}`);
    try {
      if (fs.statSync(replica).dev === fs.statSync(primary).dev) process.exit(1);
      const fd = fs.openSync(probe, "wx", 0o600);
      try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); fs.unlinkSync(probe); }
    } catch { process.exit(1); }
  ' >/dev/null 2>&1
}
if pct status "$CT_ID" | grep -q 'status: running'; then
  if pct exec "$CT_ID" -- python3 -c '
import os, tempfile
replica = "/mnt/wedding-ssd/wedding"
primary = "/opt/homelab/docker/crowdsnap/storage"
try:
    if os.stat(replica).st_dev == os.stat(primary).st_dev:
        raise OSError("replica is on CT disk")
    with tempfile.NamedTemporaryFile(prefix=".crowdsnap-probe-", dir=replica) as f:
        f.write(b"ok")
        f.flush()
        os.fsync(f.fileno())
except OSError:
    raise SystemExit(1)
  ' >/dev/null 2>&1; then
    ct_reachable=true
  fi
  if pct exec "$CT_ID" -- docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -qx true; then
    container_running=true
    if probe_container; then
      container_reachable=true
    fi
  fi

  # A healthy CT mount can be reattached to Docker with a web-only recreate.
  # Never recreate while the physical drive is absent.
  if [ "$host_mounted" = true ] && [ "$ct_reachable" = true ] && [ "$container_running" = true ] &&
     [ "$container_reachable" = false ]; then
    action=recreate
    pct exec "$CT_ID" -- sh -lc "cd '$ROOT' && docker compose up -d --force-recreate --no-deps web" || true
    if probe_container; then
      container_reachable=true
    fi
  fi

  python3 - "$STATUS" "$host_mounted" "$container_reachable" "$action" <<'PY'
import datetime, json, sys
with open(sys.argv[1], 'w') as f:
    json.dump({
        'hostMounted': sys.argv[2] == 'true',
        'containerReachable': sys.argv[3] == 'true',
        'volumeRoot': '/mnt/wedding-ssd',
        'replicaPath': '/mnt/wedding-ssd/wedding',
        'action': sys.argv[4],
        'at': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
    }, f)
    f.write('\n')
PY
  pct push "$CT_ID" "$STATUS" "$ROOT/data/ssd-status.json" >/dev/null
fi
