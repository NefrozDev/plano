import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { SESSION_COOKIE_NAME } from './auth.constants';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './auth.types';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    request.authUser = await this.authService.getSessionUser(
      request.cookies[SESSION_COOKIE_NAME],
    );

    return true;
  }
}
