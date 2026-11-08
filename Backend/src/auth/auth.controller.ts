import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { CookieOptions, Response } from 'express';
import { AllowedOriginGuard } from './allowed-origin.guard';
import {
  SESSION_COOKIE_NAME,
  SIGN_IN_COOKIE_MINUTES,
  SIGN_IN_COOKIE_NAME,
  SIGN_IN_THROTTLE,
} from './auth.constants';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest, AuthUser } from './auth.types';
import { CurrentUser } from './current-user.decorator';
import { OidcClientService, type SignInChecks } from './oidc-client.service';
import { SessionAuthGuard } from './session-auth.guard';
import { SessionSettingsService } from './session-settings.service';

interface PendingSignIn extends SignInChecks {
  returnTo: string;
}

/** A path of this site to come back to, never another site (open redirect). */
export function safeReturnPath(value: unknown): string {
  return typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.startsWith('/\\') &&
    !value.startsWith('/api/')
    ? value
    : '/';
}

function readPendingSignIn(value: string | undefined): PendingSignIn | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<PendingSignIn>;
    return typeof parsed.state === 'string' &&
      typeof parsed.nonce === 'string' &&
      typeof parsed.codeVerifier === 'string'
      ? {
          state: parsed.state,
          nonce: parsed.nonce,
          codeVerifier: parsed.codeVerifier,
          returnTo: safeReturnPath(parsed.returnTo),
        }
      : null;
  } catch {
    return null;
  }
}

/**
 * Signing in goes through the Synapse identity service (OpenID Connect): the
 * same account opens every Synapse app. Plano then keeps its own session.
 */
@Controller('auth')
@UseGuards(AllowedOriginGuard)
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private readonly signInCookie: CookieOptions;

  constructor(
    private readonly authService: AuthService,
    private readonly sessionSettings: SessionSettingsService,
    private readonly identity: OidcClientService,
    config: ConfigService,
  ) {
    this.signInCookie = {
      httpOnly: true,
      path: '/api/v1/auth',
      sameSite: 'lax',
      secure: config.get<string>('NODE_ENV') === 'production',
    };
  }

  /** Sends the browser to the identity service, then back to `returnTo`. */
  @Get('login')
  @Throttle(SIGN_IN_THROTTLE)
  async login(
    @Query('returnTo') returnTo: string | undefined,
    @Query('lang') lang: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const checks = this.identity.newChecks();
    const pending: PendingSignIn = {
      ...checks,
      returnTo: safeReturnPath(returnTo),
    };
    const url = await this.identity.authorizationUrl(
      checks,
      typeof lang === 'string' && /^[a-z]{2}$/.test(lang) ? lang : undefined,
    );
    response.cookie(SIGN_IN_COOKIE_NAME, JSON.stringify(pending), {
      ...this.signInCookie,
      maxAge: SIGN_IN_COOKIE_MINUTES * 60 * 1000,
    });
    response.redirect(303, url);
  }

  /**
   * Back from the identity service. Without this browser's pending sign-in,
   * or when the person went back without signing in, the sign-in page says
   * so; otherwise Plano's session opens.
   */
  @Get('callback')
  async callback(
    @Query() query: Record<string, string>,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    const pending = readPendingSignIn(request.cookies[SIGN_IN_COOKIE_NAME]);
    response.clearCookie(SIGN_IN_COOKIE_NAME, this.signInCookie);
    if (!pending || typeof query['code'] !== 'string') {
      response.redirect(303, '/login?signIn=cancelled');
      return;
    }
    try {
      const claims = await this.identity.signIn(query, pending);
      const authentication = await this.authService.signIn(claims);
      this.sessionSettings.setCookie(
        response,
        authentication.token,
        authentication.expiresAt,
      );
      response.redirect(303, pending.returnTo);
    } catch (error) {
      this.logger.warn(
        `Sign-in failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      response.redirect(303, '/login?signIn=failed');
    }
  }

  @Get('session')
  @UseGuards(SessionAuthGuard)
  getSession(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }

  /**
   * Ends Plano's session and answers where to send the browser next: the
   * identity service, which signs out of every Synapse app.
   */
  @Post('logout')
  @HttpCode(200)
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ redirectTo: string }> {
    await this.authService.logout(request.cookies[SESSION_COOKIE_NAME]);
    this.sessionSettings.clearCookie(response);
    const redirectTo = await this.identity.signOutUrl().catch(() => '/login');
    return { redirectTo };
  }

  /**
   * Called by the identity service, not by browsers, when a session ends
   * anywhere (OpenID Connect Back-Channel Logout).
   */
  @Post('backchannel-logout')
  @HttpCode(200)
  @SkipThrottle()
  async backchannelLogout(@Body('logout_token') token: unknown): Promise<void> {
    if (typeof token !== 'string') {
      throw new BadRequestException('logout_token is required');
    }
    const ended = await this.identity.verifyLogoutToken(token).catch(() => {
      throw new BadRequestException('Invalid logout token');
    });
    await this.authService.endSessions(ended);
  }

  /**
   * Called by the identity service when an account is deleted: Plano erases
   * everything it keeps about it. The body is a signed notice
   * (application/secevent+jwt), read as text by configureApp().
   */
  @Post('account-deleted')
  @HttpCode(204)
  @SkipThrottle()
  async accountDeleted(@Body() token: unknown): Promise<void> {
    if (typeof token !== 'string' || !token) {
      throw new BadRequestException('A signed notice is required');
    }
    const userId = await this.identity
      .verifyAccountDeletion(token)
      .catch(() => {
        throw new BadRequestException('Invalid deletion notice');
      });
    await this.authService.deleteAccount(userId);
    this.logger.log(`Account ${userId} deleted at the identity service.`);
  }
}
