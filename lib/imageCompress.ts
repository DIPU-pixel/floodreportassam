/**
 * Client-side image compression via canvas — critical on slow 4G (a 4 MB
 * phone photo becomes ~60–200 KB). Re-encoding through canvas also STRIPS
 * EXIF, so a photo's embedded GPS/home coordinates never leave the device.
 * Outputs WebP where supported (≈30 % smaller than JPEG), JPEG fallback.
 * No dependency.
 */

const WEBP_SUPPORTED =
  typeof document !== "undefined" &&
  document.createElement("canvas").toDataURL("image/webp").startsWith("data:image/webp");

export const COMPRESS_MIME = WEBP_SUPPORTED ? "image/webp" : "image/jpeg";

export async function compressImage(
  file: File,
  { maxDim = 800, quality = 0.55, maxBytes = 200 * 1024 } = {}
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const mime = COMPRESS_MIME;
  const encode = (q: number) =>
    new Promise<Blob | null>((res) => canvas.toBlob(res, mime, q));

  let q = quality;
  let blob = await encode(q);
  while (blob && blob.size > maxBytes && q > 0.3) {
    q -= 0.1;
    blob = await encode(q);
  }
  if (!blob) throw new Error("could not process image");
  return blob;
}
