import path from 'path';
import os from 'os';

const SAFE_ID = /^[a-zA-Z0-9_-]+$/;

/** Event/upload IDs must be simple path segments (no slashes or ..). */
export function isSafeId(id: string): boolean {
  return typeof id === 'string' && id.length > 0 && id.length <= 128 && SAFE_ID.test(id);
}

/**
 * Join segments under root and ensure the result stays inside root.
 * Returns null if the path would escape.
 */
export function safeJoin(root: string, ...segments: string[]): string | null {
  if (!root) return null;
  const absRoot = path.resolve(root);
  for (const seg of segments) {
    if (!seg || seg === '.' || seg === '..') return null;
    if (seg.includes('\0') || seg.includes('/') || seg.includes('\\')) return null;
    if (seg.includes('..')) return null;
  }
  const joined = path.resolve(absRoot, ...segments);
  const rel = path.relative(absRoot, joined);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return joined;
}

/**
 * Resolve a relative storage path (e.g. events/x/originals/y.jpg) under root.
 * Returns null if escape attempted.
 */
export function safeResolveUnder(root: string, relativePath: string): string | null {
  if (!root || !relativePath) return null;
  const absRoot = path.resolve(root);
  const cleaned = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!cleaned || cleaned.includes('\0')) return null;
  const parts = cleaned.split('/').filter(Boolean);
  for (const p of parts) {
    if (p === '.' || p === '..') return null;
  }
  const joined = path.resolve(absRoot, ...parts);
  const rel = path.relative(absRoot, joined);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return joined;
}

function isUnder(parent: string, child: string): boolean {
  const p = path.resolve(parent);
  const c = path.resolve(child);
  if (c === p) return true;
  const rel = path.relative(p, c);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Allowlist for STORAGE_PATH / STORAGE_REPLICA_PATH settings.
 * Allowed:
 *  - any path under process.cwd()
 *  - under /Volumes/* (macOS external disks)
 *  - under /media/* or /mnt/* (Linux mounts)
 *  - roots listed in STORAGE_ALLOWED_ROOTS (colon-separated)
 * Not allowed: /etc, /tmp, home dirs (unless listed), arbitrary absolute paths.
 */
export function isAllowedStoragePath(
  raw: string,
  cwd: string = /* turbopackIgnore: true */ process.cwd()
): boolean {
  if (!raw || typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (trimmed.includes('\0')) return false;
  if (/(^|\/|\\)\.\.(\/|\\|$)/.test(trimmed)) return false;

  const resolved = path.isAbsolute(trimmed)
    ? path.resolve(trimmed)
    : path.resolve(cwd, trimmed);

  // Project directory (relative ./storage etc.)
  if (isUnder(cwd, resolved)) return true;

  // macOS external volumes (wedding SSD backups)
  if (resolved === '/Volumes' || resolved.startsWith(`/Volumes${path.sep}`)) {
    // Require at least /Volumes/<name>/... not bare /Volumes
    const rest = resolved.slice('/Volumes'.length).replace(/^\/+/, '');
    if (rest.length > 0) return true;
  }

  // Common Linux external mount points
  for (const base of ['/media', '/mnt']) {
    if (resolved === base) continue;
    if (resolved.startsWith(`${base}${path.sep}`) && resolved.length > base.length + 1) {
      return true;
    }
  }

  // Explicit extra roots: STORAGE_ALLOWED_ROOTS=/data/photos:/opt/wedding
  const extra = (process.env.STORAGE_ALLOWED_ROOTS || '')
    .split(/[:;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const root of extra) {
    if (isUnder(root, resolved)) return true;
  }

  // Never allow home root itself as a bare path escape hatch via ~
  // (resolved already expands relative; absolute /Users/x is blocked unless under extra)
  void os.homedir;

  return false;
}
