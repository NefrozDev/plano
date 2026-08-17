import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';
import {
  DEFAULT_SESSION_TTL_DAYS,
  SESSION_COOKIE_NAME,
} from './auth.constants';

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

@Injectable()
export class SessionSettingsService {
  readonly ttlMilliseconds: number;
  private readonly cookieOptions: CookieOptions;

  constructor(config: ConfigService) {
    const configuredDays = Number(config.get<string>('SESSION_TTL_DAYS'));
    const ttlDays =
      Number.isSafeInteger(configuredDays) &&
      configuredDays >= 1 &&
      configuredDays <= 365
        ? configuredDays
        : DEFAULT_SESSION_TTL_DAYS;

    this.ttlMilliseconds = ttlDays * DAY_IN_MILLISECONDS;
    this.cookieOptions = {
      httpOnly: true,
      path: '/api/v1',
      sameSite: 'lax',
      secure: config.get<string>('NODE_ENV') === 'production',
    };
  }

  setCookie(response: Response, token: string, expiresAt: Date): void {
    response.cookie(SESSION_COOKIE_NAME, token, {
      ...this.cookieOptions,
      expires: expiresAt,
      maxAge: Math.max(0, expiresAt.getTime() - Date.now()),
    });
  }

  clearCookie(response: Response): void {
    response.clearCookie(SESSION_COOKIE_NAME, this.cookieOptions);
  }
}
