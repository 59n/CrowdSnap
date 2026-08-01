import path from 'path';

/**
 * Sanitize a ZIP entry name: basename only, no path segments, no traversal.
 * Disambiguate collisions via used set.
 */
export function sanitizeZipEntryName(
  originalName: string | null | undefined,
  fallback: string,
  used: Set<string>
): string {
  let base = path.basename((originalName || fallback || 'file').replace(/\\/g, '/'));
  // Strip residual control chars and nulls
  base = base.replace(/[\x00-\x1f\x7f]/g, '').trim();
  if (!base || base === '.' || base === '..') base = fallback || 'file';

  // Prevent empty after strip
  if (!base.includes('.')) {
    // keep as-is
  }

  let candidate = base;
  let i = 1;
  while (used.has(candidate.toLowerCase())) {
    const ext = path.extname(base);
    const stem = ext ? base.slice(0, -ext.length) : base;
    candidate = `${stem} (${i})${ext}`;
    i++;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}
