import { ConflictException, UnauthorizedException } from '@nestjs/common';
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
    findOne: jest.Mock;
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
    hash: jest.Mock;
    verify: jest.Mock;
  };
  let manager: {
    findOne: jest.Mock;
    delete: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let managerCreated: object[];
  let dataSource: {
    transaction: jest.Mock;
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
    users = {
      findOne: jest.fn().mockResolvedValue(null),
      createQueryBuilder: jest.fn().mockReturnValue(userQuery),
    };
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
    passwords = {
      hash: jest.fn().mockResolvedValue('new-password-hash'),
      verify: jest.fn(),
    };
    managerCreated = [];
    manager = {
      findOne: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue({ affected: 0, raw: [] }),
      create: jest.fn((_entity: unknown, values: object) => {
        managerCreated.push(values);
        return values;
      }),
      save: jest.fn((entity: object) => Promise.resolve(entity)),
    };
    dataSource = {
      transaction: jest.fn(
        (operation: (transactionManager: unknown) => Promise<unknown>) =>
          operation(manager),
      ),
    };
    service = new AuthService(
      users as unknown as Repository<User>,
      sessions as unknown as Repository<Session>,
      dataSource as unknown as DataSource,
      passwords as unknown as PasswordService,
      { ttlMilliseconds: 60_000 } as SessionSettingsService,
      new DatabaseWriteLockService(),
    );
  });

  it('registers a normalized user and the first session atomically', async () => {
    const authentication = await service.register({
      firstName: '  Ada ',
      lastName: ' Lovelace  ',
      username: 'ADA',
      email: ' ADA@EXAMPLE.COM ',
      password: 'password123',
      acceptedTerms: true,
    });
    const createdUser = managerCreated[0] as User;
    const createdSession = managerCreated[1] as Session;

    expect(passwords.hash).toHaveBeenCalledWith('password123');
    expect(createdUser).toMatchObject({
      firstName: 'Ada',
      lastName: 'Lovelace',
      username: 'ada',
      normalizedUsername: 'ada',
      email: 'ada@example.com',
      normalizedEmail: 'ada@example.com',
      passwordHash: 'new-password-hash',
    });
    expect(createdSession.userId).toBe(createdUser.id);
    expect(createdSession.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(authentication.user).toMatchObject({
      username: 'ada',
      email: 'ada@example.com',
    });
    expect(authentication.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(manager.delete).toHaveBeenCalled();
  });

  it('rejects an existing username or email before hashing', async () => {
    users.findOne.mockResolvedValue(user);

    await expect(
      service.register({
        firstName: 'Ada',
        lastName: 'Lovelace',
        username: 'ada',
        email: 'ada@example.com',
        password: 'password123',
        acceptedTerms: true,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(passwords.hash).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rejects a duplicate detected inside the registration transaction', async () => {
    manager.findOne.mockResolvedValue(user);

    await expect(
      service.register({
        firstName: 'Ada',
        lastName: 'Lovelace',
        username: 'ada',
        email: 'ada@example.com',
        password: 'password123',
        acceptedTerms: true,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
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

  it('rejects a wrong password for an existing user', async () => {
    userQuery.getOne.mockResolvedValue(user);
    passwords.verify.mockResolvedValue(false);

    await expect(
      service.login({ username: 'jamie.doe', password: 'wrong password' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects missing, malformed, and unknown sessions', async () => {
    await expect(service.getSessionUser(undefined)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(service.getSessionUser('bad-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    sessionQuery.getOne.mockResolvedValue(null);
    await expect(service.getSessionUser('a'.repeat(43))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('returns the user for a valid unexpired session', async () => {
    sessionQuery.getOne.mockResolvedValue(
      Object.assign(new Session(), {
        id: 'active-session',
        expiresAt: new Date(Date.now() + 60_000),
        user,
      }),
    );

    await expect(service.getSessionUser('a'.repeat(43))).resolves.toEqual({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      email: user.email,
    });
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

  it('makes logout idempotent and deletes valid session digests', async () => {
    await service.logout(undefined);
    await service.logout('malformed');
    expect(sessions.delete).not.toHaveBeenCalled();

    await service.logout('a'.repeat(43));
    expect(sessions.delete).toHaveBeenCalledWith({
      tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/) as string,
    });
  });
});
