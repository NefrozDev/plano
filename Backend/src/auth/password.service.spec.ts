import { ConfigService } from '@nestjs/config';
import { PasswordService } from './password.service';

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(() => {
    service = new PasswordService(
      new ConfigService({
        AUTH_SCRYPT_COST: '1024',
        AUTH_SCRYPT_BLOCK_SIZE: '8',
        AUTH_SCRYPT_PARALLELIZATION: '1',
      }),
    );
  });

  it('creates salted hashes and verifies the matching password', async () => {
    const firstHash = await service.hash('a sufficiently long password');
    const secondHash = await service.hash('a sufficiently long password');

    expect(firstHash).toMatch(/^scrypt\$1\$1024\$8\$1\$/);
    expect(firstHash).not.toBe(secondHash);
    await expect(
      service.verify('a sufficiently long password', firstHash),
    ).resolves.toBe(true);
  });

  it('rejects wrong passwords and malformed stored hashes', async () => {
    const hash = await service.hash('the correct password');

    await expect(service.verify('the wrong password', hash)).resolves.toBe(
      false,
    );
    await expect(service.verify('anything', 'not-a-valid-hash')).resolves.toBe(
      false,
    );
  });

  it('fails fast for an invalid scrypt cost', () => {
    expect(
      () =>
        new PasswordService(new ConfigService({ AUTH_SCRYPT_COST: '12345' })),
    ).toThrow('AUTH_SCRYPT_COST must be a power of two.');
  });
});
