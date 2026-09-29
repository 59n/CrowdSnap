/** Longest side sent to the server. Enough for a sharp phone and a small print. */
export const GUEST_PHOTO_MAX_EDGE = 2560;
/** Already-small photos are uploaded as shot. */
export const GUEST_PHOTO_SKIP_BYTES = 1_200_000;
const JPEG_QUALITY = 0.86;

export function isRasterPhoto(file: { type: string; name: string }): boolean {
  if (file.type.startsWith("video/")) return false;
  if (file.type.startsWith("image/")) return true;
  return /\.(jpe?g|png|heic|heif|webp|avif)$/i.test(file.name);
}

export function scaledPhotoSize(
  width: number,
  height: number,
  maxEdge = GUEST_PHOTO_MAX_EDGE
): { width: number; height: number } {
  const longest = Math.max(width, height);
  const scale = longest > maxEdge ? maxEdge / longest : 1;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Shrink a phone photo before it crosses the tunnel.
 * Videos and files that are already small stay untouched.
 * If the browser cannot decode the photo, the original is uploaded.
 */
export async function shrinkGuestPhoto(file: File): Promise<File> {
  if (!isRasterPhoto(file) || file.size <= GUEST_PHOTO_SKIP_BYTES) return file;
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file;

  let bitmap: ImageBitmap;
  try {
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      bitmap = await createImageBitmap(file);
    }
  } catch {
    return file;
  }

  try {
    const size = scaledPhotoSize(bitmap.width, bitmap.height);
    if (size.width === bitmap.width && size.height === bitmap.height && file.type === "image/jpeg") {
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
    });
    if (!blob || blob.size >= file.size) return file;
    const base = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${base}.jpg`, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } finally {
    bitmap.close();
  }
}
