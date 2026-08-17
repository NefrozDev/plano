import { UnauthorizedException } from '@nestjs/common';
import type { DataSource, Repository } from 'typeorm';
import { DatabaseWriteLockService } from '../database/database-write-lock.service';
import { User } from '../users/user.entity';
import { AuthService } from './auth.service';
import type { PasswordService } from './password.service';
import { Session } from './session.entity';
import type { SessionSettingsService } from './session-settings.service';

describe('AuthService', () => {
  const user = Object.assign(new User(), {
    id: '1c785224-24f1-45d4-953e-a6df91568d4a',
    firstName: 'Jamie',
    lastName: 'Doe',
    username: 'jamie.doe',
    email: 'jamie@example.com',
    passwordHash: 'stored-password-hash',
  });
  let users: {
    createQueryBuilder: jest.Mock;
  };
  let sessions: {
    create: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
    delete: jest.Mock;
  };
  let userQuery: {
    addSelect: jest.Mock;
    where: jest.Mock;
    getOne: jest.Mock;
  };
  let sessionQuery: {
    leftJoinAndSelect: jest.Mock;
    where: jest.Mock;
    getOne: jest.Mock;
  };
  let passwords: {
    verify: jest.Mock;
  };
  let createdSession: Session | undefined;
  let service: AuthService;

  beforeEach(() => {
    userQuery = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
    };
    sessionQuery = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
    };
    users = { createQueryBuilder: jest.fn().mockReturnValue(userQuery) };
    createdSession = undefined;
    sessions = {
      create: jest.fn((session: Session) => {
        createdSession = session;
        return session;
      }),
      save: jest.fn((session: Session) => Promise.resolve(session)),
      createQueryBuilder: jest.fn().mockReturnValue(sessionQuery),
      delete: jest.fn().mockResolvedValue({ affected: 1, raw: [] }),
    };
    passwords = { verify: jest.fn() };
    service = new AuthService(
      users as unknown as Repository<User>,
      sessions as unknown as Repository<Session>,
      {} as DataSource,
      passwords as unknown as PasswordService,
      { ttlMilliseconds: 60_000 } as SessionSettingsService,
      new DatabaseWriteLockService(),
    );
  });

  it('uses the same unauthorized result for an unknown user', async () => {
    userQuery.getOne.mockResolvedValue(null);
    passwords.verify.mockResolvedValue(false);

    await expect(
      service.login({ username: 'unknown.user', password: 'wrong password' }),
    ).rejects.toEqual(
      new UnauthorizedException(
        "Le nom d'utilisateur ou le mot de passe est incorrect.",
      ),
    );
    expect(passwords.verify).toHaveBeenCalledWith('wrong password', undefined);
  });

  it('stores only a digest of a newly issued session token', async () => {
    userQuery.getOne.mockResolvedValue(user);
    passwords.verify.mockResolvedValue(true);

    const authentication = await service.login({
      username: 'JAMIE.DOE',
      password: 'correct password',
    });
    const storedSession = createdSession;

    expect(authentication.user).toEqual({
      id: user.id,
      firstName: 'Jamie',
      lastName: 'Doe',
      username: 'jamie.doe',
      email: 'jamie@example.com',
    });
    expect(authentication.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(storedSession?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(storedSession?.tokenHash).not.toBe(authentication.token);
    expect(sessions.save).toHaveBeenCalledWith(storedSession);
  });

  it('deletes an expired session before rejecting it', async () => {
    const expiredSession = Object.assign(new Session(), {
      id: 'expired-session',
      expiresAt: new Date(Date.now() - 1_000),
      user,
    });
    sessionQuery.getOne.mockResolvedValue(expiredSession);

    await expect(service.getSessionUser('a'.repeat(43))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(sessions.delete).toHaveBeenCalledWith({ id: 'expired-session' });
  });
});
