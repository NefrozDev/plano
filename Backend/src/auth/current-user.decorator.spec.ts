import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedRequest, AuthUser } from './auth.types';
import { currentUserFactory } from './current-user.decorator';

describe('CurrentUser', () => {
  const user: AuthUser = {
    id: 'user-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    username: 'ada',
    email: 'ada@example.com',
  };
  const contextFor = (request: Partial<AuthenticatedRequest>) =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  it('returns the authenticated user, or one of its fields', () => {
    const context = contextFor({ authUser: user });

    expect(currentUserFactory(undefined, context)).toBe(user);
    expect(currentUserFactory('id', context)).toBe('user-1');
  });

  it('rejects a request without an attached authenticated user', () => {
    expect(() => currentUserFactory('id', contextFor({}))).toThrow(
      UnauthorizedException,
    );
  });
});
