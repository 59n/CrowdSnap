/** Bytes/sec below this, after a few seconds, counts as a slow mobile link. */
export const SLOW_UPLOAD_BYTES_PER_SEC = 100 * 1024;
const SLOW_AFTER_MS = 4_000;

/**
 * True when an in-progress upload has been moving slower than a usable
 * mobile connection. Ignores the first few seconds and finished files.
 */
export function uploadLooksSlow(
  bytesLoaded: number,
  elapsedMs: number,
  totalBytes: number
): boolean {
  if (elapsedMs < SLOW_AFTER_MS) return false;
  if (totalBytes > 0 && bytesLoaded >= totalBytes) return false;
  if (bytesLoaded < 0 || elapsedMs <= 0) return false;
  return bytesLoaded / (elapsedMs / 1000) < SLOW_UPLOAD_BYTES_PER_SEC;
}
