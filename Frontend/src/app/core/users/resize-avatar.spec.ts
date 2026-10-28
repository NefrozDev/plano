import { AVATAR_SIZE, UnreadableImageError, resizeAvatar } from './resize-avatar';

/** A real PNG of the given size, half red (left) and half blue (right). */
async function picture(width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d') as CanvasRenderingContext2D;
  context.fillStyle = '#ff0000';
  context.fillRect(0, 0, width / 2, height);
  context.fillStyle = '#0000ff';
  context.fillRect(width / 2, 0, width / 2, height);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob as Blob), 'image/png'));
}

describe('resizeAvatar', () => {
  it('crops the centred square and scales it to the avatar size, as WebP', async () => {
    const resized = await resizeAvatar(await picture(1200, 600));
    const decoded = await createImageBitmap(resized);

    expect(resized.type).toBe('image/webp');
    expect([decoded.width, decoded.height]).toEqual([AVATAR_SIZE, AVATAR_SIZE]);
    // The centred square of a red|blue landscape is still half red, half blue.
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const context = canvas.getContext('2d') as CanvasRenderingContext2D;
    context.drawImage(decoded, 0, 0);
    const [leftRed, , leftBlue] = context.getImageData(20, 128, 1, 1).data;
    const [rightRed, , rightBlue] = context.getImageData(236, 128, 1, 1).data;
    expect(leftRed).toBeGreaterThan(200);
    expect(leftBlue).toBeLessThan(60);
    expect(rightBlue).toBeGreaterThan(200);
    expect(rightRed).toBeLessThan(60);
    expect(resized.size).toBeLessThan(256 * 1024);
  });

  it('rejects files that are not images', async () => {
    await expect(resizeAvatar(new Blob(['not an image'], { type: 'image/png' }))).rejects.toBeInstanceOf(
      UnreadableImageError,
    );
  });
});
