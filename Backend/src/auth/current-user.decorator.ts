import {
  ExecutionContext,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import type { AuthenticatedRequest, AuthUser } from './auth.types';

/**
 * Reads the user that SessionAuthGuard attached to the request, or one of its
 * fields: `@CurrentUser() user: AuthUser` or `@CurrentUser('id') userId: string`.
 * Exported separately so it can be unit tested without an HTTP request.
 */
export function currentUserFactory(
  field: keyof AuthUser | undefined,
  context: ExecutionContext,
): AuthUser | AuthUser[keyof AuthUser] {
  const { authUser } = context
    .switchToHttp()
    .getRequest<AuthenticatedRequest>();
  // Only reachable when a route forgets SessionAuthGuard: fail closed.
  if (!authUser) {
    throw new UnauthorizedException('Session invalide ou expirée.');
  }
  return field ? authUser[field] : authUser;
}

export const CurrentUser = createParamDecorator(currentUserFactory);
