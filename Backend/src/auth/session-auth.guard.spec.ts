import type { ExecutionContext } from '@nestjs/common';
import { SessionAuthGuard } from './session-auth.guard';
import type { AuthService } from './auth.service';
import type { AuthenticatedRequest, AuthUser } from './auth.types';

describe('SessionAuthGuard', () => {
  it('restores the user from the session cookie onto the request', async () => {
    const user: AuthUser = {
      id: 'user-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      username: 'ada',
      email: 'ada@example.com',
    };
    const getSessionUser = jest.fn().mockResolvedValue(user);
    const guard = new SessionAuthGuard({
      getSessionUser,
    } as unknown as AuthService);
    const request = {
      cookies: { plano_session: 'session-token' },
    } as unknown as AuthenticatedRequest;
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(getSessionUser).toHaveBeenCalledWith('session-token');
    expect(request.authUser).toEqual(user);
  });
});
