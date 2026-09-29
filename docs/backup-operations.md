# CrowdSnap backups on Proxmox

## Destinations and schedules

- Proxmox CT 104 (`personal`) runs a snapshot backup at 02:30 each day to the
  `wedding-backups` storage. Proxmox retains the latest three CT archives.
- The host runs `crowdsnap-postgres-backup.timer` at 02:00 each day. It writes a
  PostgreSQL custom-format dump under `/mnt/wedding-backups/postgres` and keeps
  the latest seven.
- The Proxmox storage is a dedicated 170 GiB ext4 filesystem on the separate
  250 GB SATA SSD, mounted at `/mnt/wedding-backups`. Its `is_mountpoint` guard
  prevents a missing mount from silently filling the Proxmox root filesystem.
- The Mac LaunchAgent `us.thenas.crowdsnap.backup-pull` checks every six hours
  while the user session is active. It copies the newest CT archive and database
  dump, checks SHA-256 hashes, keeps two CT archives and seven database dumps,
  and requires 20 GiB of free space after each new transfer. The Desktop
  `Wedding Backup` folder is a link to the backup data under
  `~/Library/Application Support/CrowdSnap/Wedding Backup` so the LaunchAgent
  can access it without Desktop privacy restrictions.

The USB SSD at `/mnt/wedding-ssd` is a live photo replica. Proxmox excludes
that bind mount from the CT archive. The primary photos under the CT root
filesystem are included.

## Checks

On `pve`:

```sh
pvesm status | grep wedding-backups
pvesm list wedding-backups --content backup
systemctl status crowdsnap-postgres-backup.timer
ls -lh /mnt/wedding-backups/postgres
```

On the Mac:

```sh
launchctl print gui/$(id -u)/us.thenas.crowdsnap.backup-pull
ls -lh ~/Desktop/'Wedding Backup'/dump ~/Desktop/'Wedding Backup'/postgres
tail -20 ~/Library/Logs/CrowdSnap/backup-pull.log
```

The Mac copy can lag when the Mac is asleep or the user is logged out. Check the
latest timestamps and free space periodically. A failed pull leaves older
verified files intact.

## Restore practice

The initial PostgreSQL dump was restored to a temporary database and checked
against the live upload count, then the temporary database was removed. The CT
archive passed `zstd -t`. For a full recovery drill, restore a CT archive to a
*new* CT ID and check the app and database there before considering any
replacement of CT 104. The restored CT configuration references the USB bind
mount, so provide that mount or adjust the new CT configuration as needed.
