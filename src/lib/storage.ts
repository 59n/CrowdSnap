import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { getAppSettings } from '@/lib/settings';

/** Resolve env/settings paths to absolute so relative STORAGE_PATH always hits project root. */
function resolveStoragePath(raw: string): string {
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

/** Primary storage root — reads live settings (admin panel / .env). */
export function getPrimaryPath(): string {
  return resolveStoragePath(getAppSettings().STORAGE_PATH || './storage');
}

/** Replica / SSD root, or null if not configured. */
export function getReplicaPath(): string | null {
  const raw = (getAppSettings().STORAGE_REPLICA_PATH || '').trim();
  if (!raw) return null;
  return resolveStoragePath(raw);
}

/** Skip macOS junk / editor noise when walking storage trees. */
const SKIP_NAMES = new Set(['.DS_Store', 'Thumbs.db', '.gitkeep', '.overflow-force']);

export function getEventStoragePath(eventId: string) {
  return path.join(getPrimaryPath(), 'events', eventId);
}

export function getFilePath(eventId: string, type: 'originals' | 'thumbs' | 'metadata', filename: string) {
  return path.join(getEventStoragePath(eventId), type, filename);
}

export function getReplicaFilePath(
  eventId: string,
  type: 'originals' | 'thumbs' | 'metadata',
  filename: string
): string | null {
  if (!getReplicaPath()) return null;
  return path.join(getReplicaPath()!, 'events', eventId, type, filename);
}

export function initBaseStorage() {
  if (!fs.existsSync(getPrimaryPath())) {
    fs.mkdirSync(getPrimaryPath(), { recursive: true });
  }
}

export function initEventStorage(eventId: string) {
  const dirs = ['originals', 'thumbs', 'metadata'];
  const eventPath = getEventStoragePath(eventId);
  for (const dir of dirs) {
    fs.mkdirSync(path.join(eventPath, dir), { recursive: true });
  }
  if (getReplicaPath() && isReplicaAvailable()) {
    const replicaEventPath = path.join(getReplicaPath()!, 'events', eventId);
    for (const dir of dirs) {
      try {
        fs.mkdirSync(path.join(replicaEventPath, dir), { recursive: true });
      } catch (e) {
        console.warn('[Replica] Could not create directory:', e);
      }
    }
  }
}

/**
 * Copy a file to a destination. Fails silently for replica paths so a missing
 * SSD never breaks an upload. Returns true on success.
 */
export function replicateCopy(srcPath: string, destPath: string): boolean {
  if (!destPath) return false;
  try {
    if (!srcPath || !fs.existsSync(srcPath)) return false;
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(srcPath, destPath);
    return true;
  } catch (e) {
    console.warn(`[Replica] Copy failed ${srcPath} → ${destPath}:`, (e as Error).message);
    return false;
  }
}

/**
 * Write a buffer to a destination path. Fails silently. Returns true on success.
 */
export function replicateWrite(destPath: string, buffer: Buffer): boolean {
  if (!destPath) return false;
  try {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, buffer);
    return true;
  } catch (e) {
    console.warn(`[Replica] Write failed ${destPath}:`, (e as Error).message);
    return false;
  }
}

/**
 * Delete a file if it exists. Fails silently.
 */
export function safeUnlink(filePath: string | null | undefined) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (e) {
    console.warn(`[storage] Delete failed ${filePath}:`, (e as Error).message);
  }
}

/**
 * Delete a file from replica. Fails silently.
 */
export function replicateUnlink(filePath: string) {
  safeUnlink(filePath);
}

/**
 * Remove an upload's files from primary and (if mounted) replica.
 * Cover files are never touched.
 */
export function deleteUploadFiles(eventId: string, uploadId: string, storedName: string) {
  const relativePaths = [
    `events/${eventId}/originals/${storedName}`,
    `events/${eventId}/thumbs/${uploadId}.jpg`,
    `events/${eventId}/metadata/${uploadId}.json`,
  ];

  for (const rel of relativePaths) {
    safeUnlink(path.join(getPrimaryPath(), rel));
    if (getReplicaPath()) safeUnlink(path.join(getReplicaPath()!, rel));
  }
}

/**
 * Returns whether the replica path is reachable (SSD mounted and writable).
 */
export function isReplicaAvailable(): boolean {
  if (!getReplicaPath()) return false;
  try {
    if (!fs.existsSync(getReplicaPath()!)) {
      fs.mkdirSync(getReplicaPath()!, { recursive: true });
    }
    fs.accessSync(getReplicaPath()!, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export interface DiskStats {
  totalGB: number;
  freeGB: number;
  usedGB: number;
  percentage: number;
  /** Immediately free (no purge) — macOS only; often much lower than freeGB. */
  freeImmediateGB?: number;
  /** true when freeGB matches macOS Settings (includes purgeable space). */
  matchesSystemSettings?: boolean;
}

const GB = 1_000_000_000; // SI GB — matches macOS Settings / Finder

let macHelperPath: string | null | undefined; // undefined = not resolved yet

/**
 * Resolve (and if needed compile) the small Swift helper that reads
 * NSURLVolumeAvailableCapacityForImportantUsageKey — the same free-space
 * number System Settings shows. Node's statfs only reports "immediate" free
 * space, which excludes purgeable Time Machine snapshots / caches.
 */
function getMacDiskHelper(): string | null {
  if (macHelperPath !== undefined) return macHelperPath;
  if (process.platform !== 'darwin') {
    macHelperPath = null;
    return null;
  }

  const bin = path.join(process.cwd(), 'scripts', 'macos-disk-free');
  const src = path.join(process.cwd(), 'scripts', 'macos-disk-free.swift');

  try {
    if (fs.existsSync(bin)) {
      macHelperPath = bin;
      return bin;
    }
    if (fs.existsSync(src)) {
      // Lazy-compile once (first request after clone on a Mac)
      execFileSync('swiftc', ['-O', src, '-o', bin], {
        timeout: 60_000,
        stdio: 'pipe',
      });
      macHelperPath = bin;
      return bin;
    }
  } catch (e) {
    console.warn('[storage] macOS disk helper unavailable:', (e as Error).message);
  }

  macHelperPath = null;
  return null;
}

function getMacDiskStats(dirPath: string): DiskStats | null {
  const helper = getMacDiskHelper();
  if (!helper) return null;
  try {
    const out = execFileSync(helper, [dirPath], {
      encoding: 'utf8',
      timeout: 5_000,
    }).trim();
    const parsed = JSON.parse(out) as {
      totalBytes: number;
      immediateBytes: number;
      importantBytes: number;
    };
    const totalGB = parsed.totalBytes / GB;
    // Important usage ≈ Settings "free" (includes purgeable space macOS can reclaim)
    const freeGB = parsed.importantBytes / GB;
    const freeImmediateGB = parsed.immediateBytes / GB;
    const usedGB = Math.max(0, totalGB - freeGB);
    const percentage = totalGB > 0 ? (usedGB / totalGB) * 100 : 0;
    return {
      totalGB,
      freeGB,
      usedGB,
      percentage,
      freeImmediateGB,
      matchesSystemSettings: true,
    };
  } catch (e) {
    console.warn('[storage] macOS disk helper failed:', (e as Error).message);
    return null;
  }
}

/**
 * Filesystem stats for the volume that hosts `dirPath`.
 * On macOS, matches System Settings free space (includes purgeable APFS space).
 * Elsewhere falls back to Node statfs.
 */
export function getDiskStats(dirPath: string): DiskStats | null {
  try {
    // Ensure path exists so we target the right volume
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    if (process.platform === 'darwin') {
      const mac = getMacDiskStats(dirPath);
      if (mac) return mac;
    }

    const stat = fs.statfsSync(dirPath);
    const blockSize = stat.bsize || 4096;
    const totalGB = (stat.blocks * blockSize) / GB;
    const freeGB = (stat.bavail * blockSize) / GB;
    const usedGB = Math.max(0, totalGB - freeGB);
    const percentage = totalGB > 0 ? (usedGB / totalGB) * 100 : 0;
    return { totalGB, freeGB, usedGB, percentage, matchesSystemSettings: false };
  } catch {
    return null;
  }
}

function overflowFreeGB(): number {
  return Number(getAppSettings().STORAGE_OVERFLOW_FREE_GB) || 10;
}

function overflowPercent(): number {
  return Number(getAppSettings().STORAGE_OVERFLOW_THRESHOLD) || 98;
}

function overflowFlagPath(): string {
  return path.join(getPrimaryPath(), '.overflow-force');
}

export function getOverrideMode(): 'on' | 'off' | 'auto' {
  try {
    const flag = overflowFlagPath();
    if (!fs.existsSync(flag)) return 'auto';
    const content = fs.readFileSync(flag, 'utf8').trim();
    return content === 'off' ? 'off' : 'on';
  } catch {
    return 'auto';
  }
}

export function setOverrideMode(mode: 'on' | 'off' | 'auto') {
  const flag = overflowFlagPath();
  if (mode === 'auto') {
    if (fs.existsSync(flag)) fs.unlinkSync(flag);
  } else {
    fs.writeFileSync(flag, mode, 'utf8');
  }
}

/**
 * Returns true when primary volume free space is critically low.
 * Falls back to false if stats can't be read (never blocks an upload).
 */
export function isPrimaryNearFull(): boolean {
  const stats = getDiskStats(getPrimaryPath());
  if (!stats) return false;
  return stats.freeGB < overflowFreeGB() || stats.percentage >= overflowPercent();
}

/**
 * Decides the active write root: replica if primary is critically low on space
 * and replica is available, otherwise primary. Respects manual override flag.
 */
export function getWriteRoot(): {
  root: string;
  isOverflow: boolean;
  overrideMode: 'on' | 'off' | 'auto';
} {
  const overrideMode = getOverrideMode();
  const replicaReady = !!getReplicaPath() && isReplicaAvailable();

  const shouldOverflow =
    overrideMode === 'on' ? true :
    overrideMode === 'off' ? false :
    isPrimaryNearFull();

  if (shouldOverflow && replicaReady) {
    return { root: getReplicaPath()!, isOverflow: true, overrideMode };
  }
  return { root: getPrimaryPath(), isOverflow: false, overrideMode };
}

/**
 * Given a relative storage path (e.g. events/…/originals/x.jpg), returns the
 * first path (primary then replica) where the file exists, or null.
 */
export function resolveReadPath(relativePath: string): string | null {
  const primary = path.join(getPrimaryPath(), relativePath);
  if (fs.existsSync(primary)) return primary;
  const _repRead = getReplicaPath();
  if (_repRead) {
    const replica = path.join(_repRead, relativePath);
    if (fs.existsSync(replica)) return replica;
  }
  return null;
}

/**
 * Absolute path on primary for a relative storage path (may not exist yet).
 */
export function primaryAbs(relativePath: string): string {
  return path.join(getPrimaryPath(), relativePath);
}

/**
 * Absolute path on replica for a relative storage path, or null if no replica.
 */
export function replicaAbs(relativePath: string): string | null {
  if (!getReplicaPath()) return null;
  return path.join(getReplicaPath()!, relativePath);
}

/**
 * After writing a file to `srcAbs`, also place it on the other volume so both
 * Mac and SSD stay mirrored. Safe no-op if the other side is unavailable.
 */
export function mirrorToOtherSide(srcAbs: string, relativePath: string, wroteToReplica: boolean) {
  if (wroteToReplica) {
    // Overflow write landed on SSD — also try primary if it has room
    if (!isPrimaryNearFull()) {
      replicateCopy(srcAbs, primaryAbs(relativePath));
    }
  } else {
    // Normal write on primary — always try to mirror to SSD
    const dest = replicaAbs(relativePath);
    if (dest && isReplicaAvailable()) {
      replicateCopy(srcAbs, dest);
    }
  }
}

/**
 * Mirror a buffer write (thumbs / metadata) to the other side.
 */
export function mirrorBufferToOtherSide(
  buffer: Buffer,
  relativePath: string,
  wroteToReplica: boolean
) {
  if (wroteToReplica) {
    if (!isPrimaryNearFull()) {
      replicateWrite(primaryAbs(relativePath), buffer);
    }
  } else {
    const dest = replicaAbs(relativePath);
    if (dest && isReplicaAvailable()) {
      replicateWrite(dest, buffer);
    }
  }
}

// ── Sync helpers ────────────────────────────────────────────────────────────

/**
 * Recursively list relative file paths under `root` (posix-style separators).
 * Skips junk files.
 */
export function listRelativeFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const out: string[] = [];

  function walk(dir: string, prefix: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_NAMES.has(entry.name) || entry.name.startsWith('._')) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs, rel);
      } else if (entry.isFile()) {
        out.push(rel);
      }
    }
  }

  walk(root, '');
  return out;
}

export interface SyncDiff {
  primaryOnly: string[];
  replicaOnly: string[];
  primaryCount: number;
  replicaCount: number;
  /** Count of originals/ only (for UI upload counters). */
  primaryOriginals: number;
  replicaOriginals: number;
}

/**
 * Compare primary and replica event trees by relative path.
 */
export function diffStorageTrees(): SyncDiff {
  const primaryEvents = path.join(getPrimaryPath(), 'events');
  const _rep = getReplicaPath();
  const replicaEvents = _rep ? path.join(_rep, 'events') : null;

  const primaryFiles = new Set(listRelativeFiles(primaryEvents));
  const replicaFiles = new Set(replicaEvents ? listRelativeFiles(replicaEvents) : []);

  const primaryOnly: string[] = [];
  const replicaOnly: string[] = [];

  for (const f of primaryFiles) {
    if (!replicaFiles.has(f)) primaryOnly.push(f);
  }
  for (const f of replicaFiles) {
    if (!primaryFiles.has(f)) replicaOnly.push(f);
  }

  const countOriginals = (files: Set<string>) =>
    [...files].filter((f) => f.includes('/originals/')).length;

  return {
    primaryOnly,
    replicaOnly,
    primaryCount: primaryFiles.size,
    replicaCount: replicaFiles.size,
    primaryOriginals: countOriginals(primaryFiles),
    replicaOriginals: countOriginals(replicaFiles),
  };
}

export interface SyncResult {
  copied: number;
  skipped: number;
  failed: number;
}

/**
 * Copy files that exist under srcRoot but not destRoot (merge / one-way sync).
 * `relativeFiles` optional allowlist; if omitted, walks srcRoot.
 */
export function syncMissingFiles(
  srcRoot: string,
  destRoot: string,
  relativeFiles?: string[]
): SyncResult {
  let copied = 0;
  let skipped = 0;
  let failed = 0;

  const files = relativeFiles ?? listRelativeFiles(srcRoot);

  for (const rel of files) {
    const srcPath = path.join(srcRoot, rel);
    const destPath = path.join(destRoot, rel);

    if (!fs.existsSync(srcPath)) {
      failed++;
      continue;
    }

    // Already present with same size → skip
    if (fs.existsSync(destPath)) {
      try {
        const s = fs.statSync(srcPath);
        const d = fs.statSync(destPath);
        if (s.size === d.size) {
          skipped++;
          continue;
        }
        // Size mismatch — re-copy (incomplete previous sync)
      } catch {
        // fall through to copy
      }
    }

    try {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
      copied++;
    } catch (e) {
      console.error(`[Sync] Failed: ${srcPath} → ${destPath}`, e);
      failed++;
    }
  }

  return { copied, skipped, failed };
}

// ── Orphan cleanup (files on disk with no DB row) ───────────────────────────

const COVER_NAMES = new Set(['cover.bin', 'cover_meta.json']);

export interface KnownUpload {
  id: string;
  eventId: string;
  storedName: string;
}

/**
 * Relative paths that belong to a known DB upload (original + thumb + metadata).
 */
export function expectedPathsForUpload(u: KnownUpload): string[] {
  return [
    `events/${u.eventId}/originals/${u.storedName}`,
    `events/${u.eventId}/thumbs/${u.id}.jpg`,
    `events/${u.eventId}/metadata/${u.id}.json`,
  ];
}

/**
 * Relative paths that should exist for the given DB uploads (plus covers).
 * Used so sync never re-copies deleted/orphan files.
 */
export function allowedRelativePaths(uploads: KnownUpload[]): Set<string> {
  const allowed = new Set<string>();
  const eventIds = new Set<string>();

  for (const u of uploads) {
    eventIds.add(u.eventId);
    for (const p of expectedPathsForUpload(u)) allowed.add(p);
  }

  // Event cover images are not in the Upload table
  for (const eventId of eventIds) {
    allowed.add(`events/${eventId}/metadata/cover.bin`);
    allowed.add(`events/${eventId}/metadata/cover_meta.json`);
  }

  return allowed;
}

export interface OrphanReport {
  /** Relative paths under events/ that are not owned by any DB upload */
  orphans: string[];
  primaryOriginals: number;
  replicaOriginals: number;
  dbUploadCount: number;
}

/**
 * Find files on primary/replica that are not part of any known upload.
 * Paths are relative to the events/ root (e.g. "evtId/originals/x.jpg").
 * Cover files are never treated as orphans.
 */
export function findOrphanRelativePaths(uploads: KnownUpload[]): OrphanReport {
  const allowed = allowedRelativePaths(uploads);
  // allowed is under "events/..." — listRelativeFiles returns under events/ root without "events/" prefix
  const allowedUnderEvents = new Set(
    [...allowed].map((p) => (p.startsWith('events/') ? p.slice('events/'.length) : p))
  );

  const primaryEvents = path.join(getPrimaryPath(), 'events');
  const _rep = getReplicaPath();
  const replicaEvents = _rep ? path.join(_rep, 'events') : null;

  const onDisk = new Set([
    ...listRelativeFiles(primaryEvents),
    ...(replicaEvents ? listRelativeFiles(replicaEvents) : []),
  ]);

  const orphans: string[] = [];
  for (const rel of onDisk) {
    const base = path.basename(rel);
    if (COVER_NAMES.has(base)) continue;
    if (!allowedUnderEvents.has(rel)) orphans.push(rel);
  }

  orphans.sort();

  const countOriginals = (root: string) =>
    listRelativeFiles(root).filter((f) => f.includes('/originals/')).length;

  return {
    orphans,
    primaryOriginals: countOriginals(primaryEvents),
    replicaOriginals: replicaEvents ? countOriginals(replicaEvents) : 0,
    dbUploadCount: uploads.length,
  };
}

/**
 * Delete orphan files from primary and replica. Returns how many paths were removed
 * (counted once per relative path, even if deleted from both sides).
 */
export function purgeOrphanFiles(orphanRelsUnderEvents: string[]): {
  deleted: number;
  failed: number;
} {
  let deleted = 0;
  let failed = 0;

  for (const rel of orphanRelsUnderEvents) {
    const base = path.basename(rel);
    if (COVER_NAMES.has(base)) continue;

    const primaryPath = path.join(getPrimaryPath(), 'events', rel);
    const _repP = getReplicaPath();
    const replicaPath = _repP ? path.join(_repP, 'events', rel) : null;

    let removed = false;
    try {
      if (fs.existsSync(primaryPath)) {
        fs.unlinkSync(primaryPath);
        removed = true;
      }
    } catch {
      failed++;
    }
    try {
      if (replicaPath && fs.existsSync(replicaPath)) {
        fs.unlinkSync(replicaPath);
        removed = true;
      }
    } catch {
      failed++;
    }
    if (removed) deleted++;
  }

  return { deleted, failed };
}

/**
 * Filter a list of event-relative paths (e.g. "evt/originals/x.jpg") down to those
 * that belong to known uploads / covers. Used so SSD→Mac sync cannot resurrect deletes.
 */
export function filterToAllowedEventRels(
  eventRels: string[],
  uploads: KnownUpload[]
): string[] {
  const allowed = allowedRelativePaths(uploads);
  const allowedUnderEvents = new Set(
    [...allowed].map((p) => (p.startsWith('events/') ? p.slice('events/'.length) : p))
  );
  return eventRels.filter((rel) => {
    const base = path.basename(rel);
    if (COVER_NAMES.has(base)) return true;
    return allowedUnderEvents.has(rel);
  });
}

// Ensure base storage is initialized on file inclusion
try {
  initBaseStorage();
} catch (e) {
  console.error('Failed to initialize local storage path:', e);
}
