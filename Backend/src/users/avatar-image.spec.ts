import { detectImageType } from './avatar-image';

describe('detectImageType', () => {
  const bytes = (...values: number[]) => Buffer.from(values);
  const ascii = (text: string) => Buffer.from(text, 'ascii');

  it('recognizes JPEG, PNG and WebP from their first bytes', () => {
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(
      detectImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0)),
    ).toBe('image/png');
    expect(
      detectImageType(
        Buffer.concat([ascii('RIFF'), Buffer.alloc(4), ascii('WEBPVP8 ')]),
      ),
    ).toBe('image/webp');
  });

  it('rejects anything else, whatever it claims to be', () => {
    expect(detectImageType(ascii('GIF89a'))).toBeNull();
    expect(detectImageType(ascii('<svg onload="alert(1)">'))).toBeNull();
    expect(
      detectImageType(
        Buffer.concat([ascii('RIFF'), Buffer.alloc(4), ascii('WAVE')]),
      ),
    ).toBeNull();
    // Too short to hold a full signature.
    expect(detectImageType(bytes(0xff, 0xd8))).toBeNull();
    expect(detectImageType(bytes(0x89, 0x50, 0x4e, 0x47))).toBeNull();
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
  });
});
