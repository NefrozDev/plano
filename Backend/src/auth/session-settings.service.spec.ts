import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';
import { SESSION_COOKIE_NAME } from './auth.constants';
import { SessionSettingsService } from './session-settings.service';

describe('SessionSettingsService', () => {
  function responseSpy(): {
    response: Response;
    cookie: jest.Mock;
    clearCookie: jest.Mock;
    cookieOptions: CookieOptions[];
  } {
    const cookieOptions: CookieOptions[] = [];
    const cookie = jest.fn(
      (_name: string, _value: string, options: CookieOptions) => {
        cookieOptions.push(options);
      },
    );
    const clearCookie = jest.fn();

    return {
      response: { cookie, clearCookie } as unknown as Response,
      cookie,
      clearCookie,
      cookieOptions,
    };
  }

  it('uses a configured lifetime and secure production cookies', () => {
    const service = new SessionSettingsService(
      new ConfigService({ SESSION_TTL_DAYS: '7', NODE_ENV: 'production' }),
    );
    const { response, cookie, clearCookie, cookieOptions } = responseSpy();
    const expiresAt = new Date(Date.now() + 60_000);

    service.setCookie(response, 'token', expiresAt);
    service.clearCookie(response);

    expect(service.ttlMilliseconds).toBe(7 * 24 * 60 * 60 * 1000);
    const setOptions = cookieOptions[0];
    expect(cookie).toHaveBeenCalledWith(
      SESSION_COOKIE_NAME,
      'token',
      expect.objectContaining({
        httpOnly: true,
        path: '/api/v1',
        sameSite: 'lax',
        secure: true,
        expires: expiresAt,
      }),
    );
    expect(setOptions.maxAge).toBeGreaterThan(0);
    expect(clearCookie).toHaveBeenCalledWith(
      SESSION_COOKIE_NAME,
      expect.objectContaining({ secure: true, path: '/api/v1' }),
    );
  });

  it.each(['0', '366', 'not-a-number'])(
    'uses the default lifetime for invalid value %s',
    (configuredDays) => {
      const service = new SessionSettingsService(
        new ConfigService({ SESSION_TTL_DAYS: configuredDays }),
      );

      expect(service.ttlMilliseconds).toBe(30 * 24 * 60 * 60 * 1000);
    },
  );

  it('never creates a negative cookie max age', () => {
    const service = new SessionSettingsService(new ConfigService());
    const { response, cookieOptions } = responseSpy();

    service.setCookie(response, 'token', new Date(Date.now() - 1_000));

    expect(cookieOptions[0].maxAge).toBe(0);
  });
});
