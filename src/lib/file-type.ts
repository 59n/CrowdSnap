import path from 'path';

export type DetectedKind =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/gif'
  | 'image/heic'
  | 'image/heif'
  | 'image/avif'
  | 'video/mp4'
  | 'video/quicktime'
  | 'video/webm'
  | 'video/3gpp'
  | null;

const ALLOWED = new Set<string>([
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

  // ISO-BMFF: HEIC/AVIF/MP4/MOV/3GP all start with an ftyp box.
  if (buf.length >= 12 && buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12);
    const avifBrands = ['avif', 'avis', 'avio'];
    if (avifBrands.includes(brand)) return 'image/avif';

    const heicBrands = ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'heim', 'heis'];
    if (heicBrands.includes(brand)) {
      return brand === 'mif1' || brand === 'msf1' ? 'image/heif' : 'image/heic';
    }

    // iPhone HEVC videos use iso5/iso6; older phones use isom/mp42.
    const mp4Brands = [
      'isom',
      'iso2',
      'iso3',
      'iso4',
      'iso5',
      'iso6',
      'iso7',
      'iso8',
      'iso9',
      'mp41',
      'mp42',
      'avc1',
      'dash',
      'M4V ',
      'M4A ',
    ];
    if (mp4Brands.includes(brand) || brand.startsWith('mp4') || brand.startsWith('iso')) {
      return 'video/mp4';
    }
    if (brand === 'qt  ') return 'video/quicktime';

    const gppBrands = ['3gp4', '3gp5', '3gp6', '3gp7', '3gp8', '3gp9', '3g2a', '3g2b', '3g2c'];
    if (gppBrands.includes(brand) || brand.startsWith('3gp') || brand.startsWith('3g2')) {
      return 'video/3gpp';
    }
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
    case 'image/avif':
      return '.avif';
    case 'video/mp4':
      return '.mp4';
    case 'video/quicktime':
      return '.mov';
    case 'video/webm':
      return '.webm';
    case 'video/3gpp':
      return '.3gp';
    default:
      return path.extname('') || '.bin';
  }
}

export const MIN_MAX_FILE_MB = 1;
/** Per-event / global upload cap. Self-hosted; allow large phone videos. */
export const MAX_MAX_FILE_MB = 3072;

/** Clamp event maxFileSizeMB to a safe range. */
export function clampMaxFileSizeMB(value: unknown, fallback = 100): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_MAX_FILE_MB, Math.max(MIN_MAX_FILE_MB, Math.floor(n)));
}
