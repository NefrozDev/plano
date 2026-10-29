import { InjectionToken } from '@angular/core';

/** The API stores 256 kB at most; a 256x256 WebP weighs a few kB. */
export const AVATAR_SIZE = 256;
/** Refused before decoding: a phone photo is well below, a huge file would freeze the tab. */
export const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

export class UnreadableImageError extends Error {}

/** A square of the source picture, in its own pixels (as the browser displays it, EXIF orientation applied). */
export interface CropArea {
  x: number;
  y: number;
  size: number;
}

/**
 * Crops the picture to `area` (by default its centred square) and scales it
 * down to AVATAR_SIZE, as WebP (browsers that cannot encode WebP fall back to
 * PNG, which the API also accepts). An area reaching past the picture is pulled
 * back inside it. Throws UnreadableImageError for anything that is not an image.
 */
export async function resizeAvatar(file: Blob, area?: CropArea, size = AVATAR_SIZE): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new UnreadableImageError('Not a decodable image');
  }
  try {
    const side = Math.min(area?.size ?? Infinity, bitmap.width, bitmap.height);
    const x = clamp(area ? area.x : (bitmap.width - side) / 2, 0, bitmap.width - side);
    const y = clamp(area ? area.y : (bitmap.height - side) / 2, 0, bitmap.height - side);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) throw new UnreadableImageError('No 2D canvas');
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, x, y, side, side, 0, 0, size, size);
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export type AvatarResizer = (file: Blob, area?: CropArea) => Promise<Blob>;

/** Injected rather than imported, so specs can swap the canvas work for a fake. */
export const AVATAR_RESIZER = new InjectionToken<AvatarResizer>('AVATAR_RESIZER', {
  providedIn: 'root',
  factory: () => (file: Blob, area?: CropArea) => resizeAvatar(file, area),
});
