import path from 'path';

export type DetectedKind =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/gif'
  | 'image/heic'
  | 'image/heif'
  | 'video/mp4'
  | 'video/quicktime'
  | 'video/webm'
  | null;

const ALLOWED = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);

export function isAllowedMime(mime: string): boolean {
  return ALLOWED.has(mime);
}

/**
 * Detect media type from magic bytes (first ~12–16 bytes).
 * Returns null if unknown / not allowed.
 */
export function detectMediaType(buf: Buffer): DetectedKind {
  if (!buf || buf.length < 12) return null;

  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';

  // PNG
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return 'image/png';
  }

  // GIF
  if (buf.toString('ascii', 0, 6) === 'GIF87a' || buf.toString('ascii', 0, 6) === 'GIF89a') {
    return 'image/gif';
  }

  // WEBP: RIFF....WEBP
  if (
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  // HEIC/HEIF: ftyp box with brands
  if (buf.length >= 12 && buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12);
    const heicBrands = ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'heim', 'heis'];
    if (heicBrands.includes(brand)) {
      return brand.startsWith('hei') || brand === 'mif1' || brand === 'msf1'
        ? brand === 'mif1' || brand === 'msf1'
          ? 'image/heif'
          : 'image/heic'
        : 'image/heic';
    }
    // MP4 / QuickTime often use ftyp too
    const mp4Brands = ['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'dash', 'M4V ', 'M4A '];
    if (mp4Brands.includes(brand) || brand.startsWith('mp4')) return 'video/mp4';
    if (brand === 'qt  ') return 'video/quicktime';
  }

  // WebM / Matroska EBML
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return 'video/webm';
  }

  return null;
}

/** Prefer magic-byte type; fall back to client mime only if magic matches allowlist family. */
export function resolveUploadType(
  headerMime: string,
  head: Buffer
): { mime: DetectedKind; ext: string } | { error: string } {
  const magic = detectMediaType(head);
  if (magic && isAllowedMime(magic)) {
    return { mime: magic, ext: extForMime(magic) };
  }
  // HEIC sometimes mislabeled; if header says heic and magic is ftyp-ish already handled
  if (isAllowedMime(headerMime) && magic === null && head.length < 12) {
    return { error: 'File too small to validate type' };
  }
  if (isAllowedMime(headerMime) && magic === null) {
    // Do not trust client MIME alone for unknown magic
    return { error: 'Unrecognized or disallowed file type' };
  }
  return { error: 'Unrecognized or disallowed file type' };
}

export function extForMime(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'image/gif':
      return '.gif';
    case 'image/heic':
      return '.heic';
    case 'image/heif':
      return '.heif';
    case 'video/mp4':
      return '.mp4';
    case 'video/quicktime':
      return '.mov';
    case 'video/webm':
      return '.webm';
    default:
      return path.extname('') || '.bin';
  }
}

export const MIN_MAX_FILE_MB = 1;
export const MAX_MAX_FILE_MB = 200;

/** Clamp event maxFileSizeMB to a safe range. */
export function clampMaxFileSizeMB(value: unknown, fallback = 100): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_MAX_FILE_MB, Math.max(MIN_MAX_FILE_MB, Math.floor(n)));
}
