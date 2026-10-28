import type { AvatarType } from '@plano/common';

/** The browser sends a 256x256 WebP of a few kB: this leaves room for JPEG and PNG. */
export const MAX_AVATAR_BYTES = 256 * 1024;

/** What Multer hands over for an in-memory upload; the only fields read here. */
export interface UploadedImage {
  buffer: Buffer;
  size: number;
}

/**
 * The image type read from the file's first bytes. The client's Content-Type
 * and file name are ignored: they are whatever the sender claims.
 */
export function detectImageType(data: Buffer): AvatarType | null {
  if (
    data.length >= 3 &&
    data[0] === 0xff &&
    data[1] === 0xd8 &&
    data[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  if (
    data.length >= 8 &&
    data
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (
    data.length >= 12 &&
    data.toString('ascii', 0, 4) === 'RIFF' &&
    data.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}
