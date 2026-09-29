#!/usr/bin/env bash
# Run on the Proxmox host after verifying the dedicated SATA backup mount.
set -euo pipefail
umask 077

BACKUP_ROOT=/mnt/wedding-backups
DB_DIR="$BACKUP_ROOT/postgres"
CONTAINER=crowdsnap-db-1

mountpoint -q "$BACKUP_ROOT" || { echo "Backup filesystem is not mounted" >&2; exit 1; }
mkdir -p "$DB_DIR"
stamp="$(date -u +%Y_%m_%d-%H_%M_%S)"
final="$DB_DIR/crowdsnap-postgres-$stamp.dump"
partial="$final.partial"
trap 'rm -f "$partial"' EXIT

pct exec 104 -- docker exec "$CONTAINER" sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$partial"
test -s "$partial"
test "$(head -c 5 "$partial")" = PGDMP
mv "$partial" "$final"
trap - EXIT

python3 - "$DB_DIR" <<'PY'
from pathlib import Path
import sys
backups = sorted(Path(sys.argv[1]).glob('crowdsnap-postgres-*.dump'))
for old in backups[:-7]:
    old.unlink()
PY
echo "$final"
