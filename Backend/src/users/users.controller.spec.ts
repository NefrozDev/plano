import type { Mock } from 'vitest';
import type { Response } from 'express';
import { UsersController } from './users.controller';
import type { UsersService } from './users.service';

describe('UsersController', () => {
  let users: Record<string, Mock>;
  let controller: UsersController;
  const file = { buffer: Buffer.from('x'), size: 1 };

  beforeEach(() => {
    users = {
      updateProfile: vi.fn().mockResolvedValue('profile'),
      setAvatar: vi.fn().mockResolvedValue('set'),
      removeAvatar: vi.fn().mockResolvedValue('removed'),
      findAvatar: vi
        .fn()
        .mockResolvedValue({ data: Buffer.from([1, 2]), type: 'image/webp' }),
    };
    controller = new UsersController(users as unknown as UsersService);
  });

  it('updates the signed-in user only', async () => {
    await expect(
      controller.updateProfile('user-1', { locale: 'en' }),
    ).resolves.toBe('profile');
    await expect(controller.setAvatar('user-1', file)).resolves.toBe('set');
    await expect(controller.removeAvatar('user-1')).resolves.toBe('removed');

    expect(users.updateProfile).toHaveBeenCalledWith('user-1', {
      locale: 'en',
    });
    expect(users.setAvatar).toHaveBeenCalledWith('user-1', file);
    expect(users.removeAvatar).toHaveBeenCalledWith('user-1');
    expect(users.findAvatar).not.toHaveBeenCalled();
  });

  it('serves a picture with its type, long caching and no sniffing', async () => {
    const set = vi.fn();
    const response = { set } as unknown as Response;

    const streamed = await controller.avatar('user-2', response);

    expect(users.findAvatar).toHaveBeenCalledTimes(1);
    expect(users.findAvatar).toHaveBeenCalledWith('user-2');
    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith({
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
    expect(streamed.getHeaders().type).toBe('image/webp');
  });
});
