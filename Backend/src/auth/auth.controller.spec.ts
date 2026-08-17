import { UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';
import type {
  AuthenticatedRequest,
  AuthUser,
  IssuedAuthentication,
} from './auth.types';
import type { SessionSettingsService } from './session-settings.service';

describe('AuthController', () => {
  const user: AuthUser = {
    id: 'user-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    username: 'ada',
    email: 'ada@example.com',
  };
  const authentication: IssuedAuthentication = {
    user,
    token: 'session-token',
    expiresAt: new Date('2030-01-01T00:00:00.000Z'),
  };
  let authService: {
    register: jest.Mock;
    login: jest.Mock;
    logout: jest.Mock;
  };
  let sessionSettings: {
    setCookie: jest.Mock;
    clearCookie: jest.Mock;
  };
  let controller: AuthController;
  let response: Response;

  beforeEach(() => {
    authService = {
      register: jest.fn().mockResolvedValue(authentication),
      login: jest.fn().mockResolvedValue(authentication),
      logout: jest.fn().mockResolvedValue(undefined),
    };
    sessionSettings = {
      setCookie: jest.fn(),
      clearCookie: jest.fn(),
    };
    controller = new AuthController(
      authService as unknown as AuthService,
      sessionSettings as unknown as SessionSettingsService,
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

  it('returns only the user attached by the session guard', () => {
    expect(
      controller.getSession({ authUser: user } as AuthenticatedRequest),
    ).toEqual(user);
    expect(() => controller.getSession({} as AuthenticatedRequest)).toThrow(
      UnauthorizedException,
    );
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
