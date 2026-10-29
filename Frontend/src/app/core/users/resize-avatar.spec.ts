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

/** RGBA of the resized avatar's corners and centre. */
async function pixels(blob: Blob): Promise<Uint8ClampedArray[]> {
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const context = canvas.getContext('2d') as CanvasRenderingContext2D;
  context.drawImage(await createImageBitmap(blob), 0, 0);
  return [
    [10, 10],
    [AVATAR_SIZE - 10, 10],
    [AVATAR_SIZE / 2, AVATAR_SIZE / 2],
    [10, AVATAR_SIZE - 10],
    [AVATAR_SIZE - 10, AVATAR_SIZE - 10],
  ].map(([x, y]) => context.getImageData(x, y, 1, 1).data);
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

  it('crops the chosen area, pulling an area that overflows back inside the picture', async () => {
    const source = await picture(1200, 600);

    // The left square of a red|blue landscape is all red.
    const left = await pixels(await resizeAvatar(source, { x: 0, y: 0, size: 600 }));
    expect(left.every(([red, , blue]) => red > 200 && blue < 60)).toBe(true);

    // Past the right and top edges: clamped to the right square, all blue.
    const right = await pixels(await resizeAvatar(source, { x: 900, y: -50, size: 600 }));
    expect(right.every(([red, , blue]) => blue > 200 && red < 60)).toBe(true);

    // Larger than the picture: shrunk to its short side, so still a full square.
    const decoded = await createImageBitmap(await resizeAvatar(source, { x: 0, y: 0, size: 5000 }));
    expect([decoded.width, decoded.height]).toEqual([AVATAR_SIZE, AVATAR_SIZE]);
  });

  it('rejects files that are not images', async () => {
    await expect(resizeAvatar(new Blob(['not an image'], { type: 'image/png' }))).rejects.toBeInstanceOf(
      UnreadableImageError,
    );
  });
});
