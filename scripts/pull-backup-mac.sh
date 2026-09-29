#!/usr/bin/env bash
# Pull the newest completed CT archive and Postgres dump from pve to this Mac.
set -euo pipefail
umask 077

DEST="${CROWDSNAP_BACKUP_DEST:-$HOME/Library/Application Support/CrowdSnap/Wedding Backup}"
REMOTE="${CROWDSNAP_BACKUP_REMOTE:-pve}"
REMOTE_ROOT="${CROWDSNAP_BACKUP_REMOTE_ROOT:-/mnt/wedding-backups}"
RESERVE_KIB=$((20 * 1024 * 1024))
mkdir -p "$DEST"

latest_remote() {
  ssh -o BatchMode=yes "$REMOTE" "find '$REMOTE_ROOT/$1' -maxdepth 1 -type f -name '$2' -printf '%f\n' | sort | tail -n 1"
}

copy_verified() {
  local subdir="$1" name="$2" pattern="$3" size free_kib needed_kib remote_hash local_hash
  [[ "$name" =~ $pattern ]] || { echo "Unexpected backup filename: $name" >&2; return 1; }
  local target="$DEST/$subdir"
  mkdir -p "$target"
  size="$(ssh -o BatchMode=yes "$REMOTE" "stat -c %s '$REMOTE_ROOT/$subdir/$name'")"
  if [[ ! -f "$target/$name" ]]; then
    free_kib="$(df -kP "$DEST" | awk 'NR==2 {print $4}')"
    needed_kib=$(( (size + 1023) / 1024 + RESERVE_KIB ))
    if (( free_kib < needed_kib )); then
      echo "Skipping $name: Mac needs $((needed_kib / 1024 / 1024)) GiB including reserve, has $((free_kib / 1024 / 1024)) GiB" >&2
      return 1
    fi
    rsync -a --partial "$REMOTE:$REMOTE_ROOT/$subdir/$name" "$target/"
  fi
  remote_hash="$(ssh -o BatchMode=yes "$REMOTE" "sha256sum '$REMOTE_ROOT/$subdir/$name'" | awk '{print $1}')"
  local_hash="$(shasum -a 256 "$target/$name" | awk '{print $1}')"
  [[ "$remote_hash" = "$local_hash" ]] || { echo "Checksum mismatch: $name" >&2; return 1; }
  echo "Verified $target/$name"
}

archive="$(latest_remote dump 'vzdump-lxc-104-*.tar.zst')"
database="$(latest_remote postgres 'crowdsnap-postgres-*.dump')"
[[ -n "$archive" && -n "$database" ]] || { echo 'CT archive or Postgres dump is not available yet' >&2; exit 1; }

copy_verified dump "$archive" '^vzdump-lxc-104-[0-9_ -]+\.tar\.zst$'
copy_verified postgres "$database" '^crowdsnap-postgres-[0-9_ -]+\.dump$'

prune_local() {
  local dir="$DEST/$1" keep="$2" pattern="$3"
  [[ -d "$dir" ]] || return 0
  python3 - "$dir" "$keep" "$pattern" <<'PY'
from pathlib import Path
import sys
dir_path = Path(sys.argv[1])
keep = int(sys.argv[2])
pattern = sys.argv[3]
files = sorted(f for f in dir_path.glob(pattern) if f.is_file())
for old in files[:-keep]:
    old.unlink()
PY
}

prune_local dump 2 'vzdump-lxc-104-*.tar.zst'
prune_local postgres 7 'crowdsnap-postgres-*.dump'
