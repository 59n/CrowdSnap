/**
 * Client-side guest picker filter. Intentionally permissive: iOS often
 * sends an empty MIME type for HEIC/MOV. The server still sniffs magic bytes.
 */

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/avif',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/3gpp',
  'video/3gpp2',
]);

const ALLOWED_EXT = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.heic',
  '.heif',
  '.avif',
  '.mp4',
  '.mov',
  '.m4v',
  '.webm',
  '.3gp',
  '.3g2',
]);

export function isLikelyGuestMediaFile(file: { type?: string; name?: string }): boolean {
  const mime = (file.type || '').toLowerCase().trim();
  if (ALLOWED_MIME.has(mime)) return true;
  if (mime.startsWith('image/') || mime.startsWith('video/')) return true;

  const base = (file.name || '').split(/[\\/]/).pop() || '';
  const dot = base.lastIndexOf('.');
  if (dot <= 0) {
    // Camera blobs sometimes have no extension and empty MIME — let the server sniff.
    return !mime;
  }
  return ALLOWED_EXT.has(base.slice(dot).toLowerCase());
}
