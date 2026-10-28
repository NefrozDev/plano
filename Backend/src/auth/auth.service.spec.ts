import type { Mock } from 'vitest';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { QueryFailedError, type DataSource, type Repository } from 'typeorm';
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
    locale: 'fr',
    avatarUpdatedAt: null,
  });
  let users: {
    findOne: Mock;
    createQueryBuilder: Mock;
  };
  let sessions: {
    create: Mock;
    save: Mock;
    createQueryBuilder: Mock;
    delete: Mock;
  };
  let userQuery: {
    addSelect: Mock;
    where: Mock;
    getOne: Mock;
  };
  let sessionQuery: {
    leftJoinAndSelect: Mock;
    where: Mock;
    getOne: Mock;
  };
  let passwords: {
    hash: Mock;
    verify: Mock;
  };
  let manager: {
    findOne: Mock;
    delete: Mock;
    create: Mock;
    save: Mock;
  };
  let managerCreated: object[];
  let dataSource: {
    transaction: Mock;
  };
  let createdSession: Session | undefined;
  let service: AuthService;

  beforeEach(() => {
    userQuery = {
      addSelect: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      getOne: vi.fn(),
    };
    sessionQuery = {
      leftJoinAndSelect: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      getOne: vi.fn(),
    };
    users = {
      findOne: vi.fn().mockResolvedValue(null),
      createQueryBuilder: vi.fn().mockReturnValue(userQuery),
    };
    createdSession = undefined;
    sessions = {
      create: vi.fn((session: Session) => {
        createdSession = session;
        return session;
      }),
      save: vi.fn((session: Session) => Promise.resolve(session)),
      createQueryBuilder: vi.fn().mockReturnValue(sessionQuery),
      delete: vi.fn().mockResolvedValue({ affected: 1, raw: [] }),
    };
    passwords = {
      hash: vi.fn().mockResolvedValue('new-password-hash'),
      verify: vi.fn(),
    };
    managerCreated = [];
    manager = {
      findOne: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue({ affected: 0, raw: [] }),
      create: vi.fn((_entity: unknown, values: object) => {
        managerCreated.push(values);
        return values;
      }),
      save: vi.fn((entity: object) => Promise.resolve(entity)),
    };
    dataSource = {
      transaction: vi.fn(
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
      // Without a language from the client, the account starts in French.
      locale: 'fr',
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

  it('keeps the language the user registered in', async () => {
    await service.register({
      firstName: 'Ada',
      lastName: 'Lovelace',
      username: 'ada',
      email: 'ada@example.com',
      password: 'password123',
      acceptedTerms: true,
      locale: 'de',
    });

    expect(managerCreated[0]).toMatchObject({ username: 'ada', locale: 'de' });
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
    // The re-check runs inside the transaction and stops before any write.
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.findOne).toHaveBeenCalledTimes(1);
    expect(manager.save).not.toHaveBeenCalled();
    expect(managerCreated).toEqual([]);
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
    // Verifying even without a user keeps the timing of both failures alike.
    expect(passwords.verify).toHaveBeenCalledTimes(1);
    expect(passwords.verify).toHaveBeenCalledWith('wrong password', undefined);
    expect(sessions.save).not.toHaveBeenCalled();
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
      locale: 'fr',
      avatarVersion: null,
    });
    expect(authentication.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(storedSession?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(storedSession?.tokenHash).not.toBe(authentication.token);
    expect(storedSession?.userId).toBe(user.id);
    expect(storedSession?.expiresAt).toEqual(authentication.expiresAt);
    // Usernames are matched case-insensitively.
    expect(userQuery.where).toHaveBeenCalledWith(
      'user.normalizedUsername = :normalizedUsername',
      { normalizedUsername: 'jamie.doe' },
    );
    expect(passwords.verify).toHaveBeenCalledWith(
      'correct password',
      'stored-password-hash',
    );
    expect(sessions.save).toHaveBeenCalledTimes(1);
    expect(sessions.save).toHaveBeenCalledWith(storedSession);
  });

  it('rejects a wrong password for an existing user', async () => {
    userQuery.getOne.mockResolvedValue(user);
    passwords.verify.mockResolvedValue(false);

    await expect(
      service.login({ username: 'jamie.doe', password: 'wrong password' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(passwords.verify).toHaveBeenCalledWith(
      'wrong password',
      'stored-password-hash',
    );
    expect(sessions.create).not.toHaveBeenCalled();
    expect(sessions.save).not.toHaveBeenCalled();
  });

  it('rejects missing, malformed, and unknown sessions', async () => {
    await expect(service.getSessionUser(undefined)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(service.getSessionUser('bad-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    // Malformed tokens never reach the database.
    expect(sessions.createQueryBuilder).not.toHaveBeenCalled();
    sessionQuery.getOne.mockResolvedValue(null);
    await expect(service.getSessionUser('a'.repeat(43))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(sessions.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(sessions.delete).not.toHaveBeenCalled();
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
      locale: 'fr',
      avatarVersion: null,
    });
    // Looked up by digest, never by the raw token.
    expect(sessionQuery.where).toHaveBeenCalledTimes(1);
    expect(sessionQuery.where).toHaveBeenCalledWith(
      'session.tokenHash = :tokenHash',
      { tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/) as string },
    );
    expect(sessionQuery.where).not.toHaveBeenCalledWith(expect.anything(), {
      tokenHash: 'a'.repeat(43),
    });
    expect(sessions.delete).not.toHaveBeenCalled();
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
    expect(sessions.delete).toHaveBeenCalledTimes(1);
    expect(sessions.delete).toHaveBeenCalledWith({ id: 'expired-session' });
  });

  it('makes logout idempotent and deletes valid session digests', async () => {
    await service.logout(undefined);
    await service.logout('malformed');
    expect(sessions.delete).not.toHaveBeenCalled();

    await service.logout('a'.repeat(43));
    expect(sessions.delete).toHaveBeenCalledTimes(1);
    expect(sessions.delete).toHaveBeenCalledWith({
      tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/) as string,
    });
  });

  describe('when the database rejects the registration', () => {
    const details = {
      firstName: 'Ada',
      lastName: 'Lovelace',
      username: 'ada',
      email: 'ada@example.com',
      password: 'password123',
      acceptedTerms: true,
    };

    it('turns a unique-constraint race into a conflict', async () => {
      // Two concurrent sign-ups can both pass the duplicate checks; the
      // database unique index is the last line of defence.
      manager.save.mockRejectedValueOnce(
        new QueryFailedError(
          'INSERT',
          [],
          new Error('UNIQUE constraint failed: users.normalizedEmail'),
        ),
      );

      await expect(service.register(details)).rejects.toEqual(
        new ConflictException(
          "Ce nom d'utilisateur ou cette adresse e-mail est déjà utilisé.",
        ),
      );
      // The user insert failed first: no session was written for it.
      expect(manager.save).toHaveBeenCalledTimes(1);
    });

    it('rethrows other database and runtime errors unchanged', async () => {
      const queryError = new QueryFailedError(
        'INSERT',
        [],
        new Error('disk I/O error'),
      );
      manager.save.mockRejectedValueOnce(queryError);
      await expect(service.register(details)).rejects.toBe(queryError);
      expect(manager.save).toHaveBeenCalledTimes(1);

      const runtimeError = new Error('connection lost');
      manager.save.mockRejectedValueOnce(runtimeError);
      await expect(service.register(details)).rejects.toBe(runtimeError);
    });
  });
});
