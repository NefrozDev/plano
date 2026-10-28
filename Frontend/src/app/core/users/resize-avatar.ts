import { InjectionToken } from '@angular/core';

/** The API stores 256 kB at most; a 256x256 WebP weighs a few kB. */
export const AVATAR_SIZE = 256;
/** Refused before decoding: a phone photo is well below, a huge file would freeze the tab. */
export const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

export class UnreadableImageError extends Error {}

/**
 * Crops the picture to its centred square and scales it down to AVATAR_SIZE,
 * as WebP (browsers that cannot encode WebP fall back to PNG, which the API
 * also accepts). Throws UnreadableImageError for anything that is not an image.
 */
export async function resizeAvatar(file: Blob, size = AVATAR_SIZE): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new UnreadableImageError('Not a decodable image');
  }
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) throw new UnreadableImageError('No 2D canvas');
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new UnreadableImageError('Encoding failed'))),
        'image/webp',
        0.85,
      ),
    );
  } finally {
    bitmap.close();
  }
}

/** Injected rather than imported, so specs can swap the canvas work for a fake. */
export const AVATAR_RESIZER = new InjectionToken<(file: Blob) => Promise<Blob>>('AVATAR_RESIZER', {
  providedIn: 'root',
  factory: () => resizeAvatar,
});
