import type { Mock } from 'vitest';
import type { Response } from 'express';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';
import type {
  AuthenticatedRequest,
  AuthUser,
  IssuedAuthentication,
} from './auth.types';
import type { PasswordResetService } from './password-reset.service';
import type { SessionSettingsService } from './session-settings.service';

describe('AuthController', () => {
  const user: AuthUser = {
    id: 'user-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    username: 'ada',
    email: 'ada@example.com',
    locale: 'fr',
    avatarVersion: null,
  };
  const authentication: IssuedAuthentication = {
    user,
    token: 'session-token',
    expiresAt: new Date('2030-01-01T00:00:00.000Z'),
  };
  let authService: {
    register: Mock;
    login: Mock;
    logout: Mock;
  };
  let sessionSettings: {
    setCookie: Mock;
    clearCookie: Mock;
  };
  let passwordResets: { request: Mock; confirm: Mock };
  let controller: AuthController;
  let response: Response;

  beforeEach(() => {
    authService = {
      register: vi.fn().mockResolvedValue(authentication),
      login: vi.fn().mockResolvedValue(authentication),
      logout: vi.fn().mockResolvedValue(undefined),
    };
    sessionSettings = {
      setCookie: vi.fn(),
      clearCookie: vi.fn(),
    };
    passwordResets = {
      request: vi.fn().mockResolvedValue(undefined),
      confirm: vi.fn().mockResolvedValue(undefined),
    };
    controller = new AuthController(
      authService as unknown as AuthService,
      sessionSettings as unknown as SessionSettingsService,
      passwordResets as unknown as PasswordResetService,
    );
    response = {} as Response;
  });

  it('registers a user and sets the issued cookie', async () => {
    const details = {
      firstName: 'Ada',
      lastName: 'Lovelace',
      username: 'ada',
      email: 'ada@example.com',
      password: 'password123',
      acceptedTerms: true,
    };

    await expect(controller.register(details, response)).resolves.toEqual(user);
    expect(authService.register).toHaveBeenCalledWith(details);
    expect(sessionSettings.setCookie).toHaveBeenCalledWith(
      response,
      authentication.token,
      authentication.expiresAt,
    );
  });

  it('logs in and sets the issued cookie', async () => {
    const credentials = { username: 'ada', password: 'password123' };

    await expect(controller.login(credentials, response)).resolves.toEqual(
      user,
    );
    expect(authService.login).toHaveBeenCalledWith(credentials);
    expect(sessionSettings.setCookie).toHaveBeenCalledWith(
      response,
      authentication.token,
      authentication.expiresAt,
    );
  });

  it('forwards password recovery without touching sessions or cookies', async () => {
    await expect(
      controller.requestPasswordReset({ email: 'ada@example.com' }),
    ).resolves.toBeUndefined();
    await expect(
      controller.confirmPasswordReset({
        token: 't'.repeat(43),
        password: 'new-password',
      }),
    ).resolves.toBeUndefined();

    expect(passwordResets.request).toHaveBeenCalledExactlyOnceWith(
      'ada@example.com',
    );
    expect(passwordResets.confirm).toHaveBeenCalledExactlyOnceWith(
      't'.repeat(43),
      'new-password',
    );
    expect(authService.login).not.toHaveBeenCalled();
    expect(sessionSettings.setCookie).not.toHaveBeenCalled();
  });

  it('returns the user attached by the session guard', () => {
    expect(controller.getSession(user)).toEqual(user);
  });

  it('revokes the current cookie and clears it', async () => {
    const request = {
      cookies: { plano_session: 'session-token' },
    } as unknown as AuthenticatedRequest;

    await controller.logout(request, response);

    expect(authService.logout).toHaveBeenCalledWith('session-token');
    expect(sessionSettings.clearCookie).toHaveBeenCalledWith(response);
  });
});
