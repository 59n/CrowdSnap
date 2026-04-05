import fs from 'fs';
import path from 'path';

const BASE_PATH = process.env.STORAGE_PATH || './storage';
export const REPLICA_PATH = process.env.STORAGE_REPLICA_PATH || null;

export function getEventStoragePath(eventId: string) {
  return path.join(BASE_PATH, 'events', eventId);
}

export function getFilePath(eventId: string, type: 'originals' | 'thumbs' | 'metadata', filename: string) {
  return path.join(getEventStoragePath(eventId), type, filename);
}

export function getReplicaFilePath(eventId: string, type: 'originals' | 'thumbs' | 'metadata', filename: string): string | null {
  if (!REPLICA_PATH) return null;
  return path.join(REPLICA_PATH, 'events', eventId, type, filename);
}

export function initBaseStorage() {
  if (!fs.existsSync(BASE_PATH)) {
    fs.mkdirSync(BASE_PATH, { recursive: true });
  }
}

export function initEventStorage(eventId: string) {
  const dirs = ['originals', 'thumbs', 'metadata'];
  const eventPath = getEventStoragePath(eventId);
  for (const dir of dirs) {
    fs.mkdirSync(path.join(eventPath, dir), { recursive: true });
  }
  if (REPLICA_PATH) {
    const replicaEventPath = path.join(REPLICA_PATH, 'events', eventId);
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
 * Copy a file from primary path to replica path.
 * Fails silently — a missing/unmounted SSD should never break an upload.
 */
export function replicateCopy(srcPath: string, destPath: string) {
  if (!REPLICA_PATH) return;
  try {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(srcPath, destPath);
  } catch (e) {
    console.warn(`[Replica] Copy failed ${srcPath} → ${destPath}:`, (e as Error).message);
  }
}

/**
 * Write a buffer to replica path.
 * Fails silently.
 */
export function replicateWrite(destPath: string, buffer: Buffer) {
  if (!REPLICA_PATH) return;
  try {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, buffer);
  } catch (e) {
    console.warn(`[Replica] Write failed ${destPath}:`, (e as Error).message);
  }
}

/**
 * Delete a file from replica.
 * Fails silently.
 */
export function replicateUnlink(filePath: string) {
  if (!REPLICA_PATH) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (e) {
    console.warn(`[Replica] Delete failed ${filePath}:`, (e as Error).message);
  }
}

/**
 * Returns whether the replica path is reachable (SSD mounted).
 */
export function isReplicaAvailable(): boolean {
  if (!REPLICA_PATH) return false;
  try {
    fs.accessSync(REPLICA_PATH, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

const OVERFLOW_THRESHOLD = Number(process.env.STORAGE_OVERFLOW_THRESHOLD ?? 90);

// A flag file placed in the storage root manually forces overflow mode on/off.
// Presence of the file = forced ON. Content "off" = forced OFF (auto mode).
const OVERFLOW_FLAG_PATH = path.join(BASE_PATH, '.overflow-force');

export function getOverrideMode(): 'on' | 'off' | 'auto' {
  try {
    if (!fs.existsSync(OVERFLOW_FLAG_PATH)) return 'auto';
    const content = fs.readFileSync(OVERFLOW_FLAG_PATH, 'utf8').trim();
    return content === 'off' ? 'off' : 'on';
  } catch {
    return 'auto';
  }
}

export function setOverrideMode(mode: 'on' | 'off' | 'auto') {
  if (mode === 'auto') {
    if (fs.existsSync(OVERFLOW_FLAG_PATH)) fs.unlinkSync(OVERFLOW_FLAG_PATH);
  } else {
    fs.writeFileSync(OVERFLOW_FLAG_PATH, mode, 'utf8');
  }
}

/**
 * Returns true when primary disk usage is at or above the overflow threshold.
 * Falls back to false if stats can't be read (never blocks an upload).
 */
export function isPrimaryNearFull(): boolean {
  try {
    const stat = fs.statfsSync(BASE_PATH);
    const used = (stat.blocks - stat.bavail) / stat.blocks * 100;
    return used >= OVERFLOW_THRESHOLD;
  } catch {
    return false;
  }
}

/**
 * Decides the active write root: replica if primary is near-full and replica is
 * available, otherwise primary. Respects manual override flag.
 * Returns { root, isOverflow, overrideMode }.
 */
export function getWriteRoot(): { root: string; isOverflow: boolean; overrideMode: 'on' | 'off' | 'auto' } {
  const overrideMode = getOverrideMode();
  const replicaReady = REPLICA_PATH && isReplicaAvailable();

  const shouldOverflow =
    overrideMode === 'on'  ? true :
    overrideMode === 'off' ? false :
    isPrimaryNearFull();

  if (shouldOverflow && replicaReady) {
    return { root: REPLICA_PATH!, isOverflow: true, overrideMode };
  }
  return { root: BASE_PATH, isOverflow: false, overrideMode };
}

/**
 * Given a relative storage path, returns the first path (primary then replica)
 * where the file actually exists on disk, or null if missing from both.
 */
export function resolveReadPath(relativePath: string): string | null {
  const primary = path.join(BASE_PATH, relativePath);
  if (fs.existsSync(primary)) return primary;
  if (REPLICA_PATH) {
    const replica = path.join(REPLICA_PATH, relativePath);
    if (fs.existsSync(replica)) return replica;
  }
  return null;
}

// Ensure base storage is initialized on file inclusion
try {
  initBaseStorage();
} catch (e) {
  console.error('Failed to initialize local storage path:', e);
}
