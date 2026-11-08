import { UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { DatabaseWriteLockService } from '../database/database-write-lock.service';
import { MIGRATIONS } from '../database/migrations';
import {
  createTestDatabase,
  ENTITIES,
  type TestDatabase,
} from '../database/testing/test-database';
import { List } from '../lists/entities/list.entity';
import { User } from '../users/user.entity';
import { AuthService } from './auth.service';
import type { IdentityClaims } from './oidc-client.service';
import { Session } from './session.entity';
import type { SessionSettingsService } from './session-settings.service';

describe('AuthService', () => {
  let database: TestDatabase;
  let dataSource: DataSource;
  let service: AuthService;

  const claimsFor = (
    overrides: Partial<IdentityClaims> = {},
  ): IdentityClaims => ({
    sub: randomUUID(),
    username: 'Jamie.Doe',
    firstName: ' Jamie ',
    lastName: 'Doe',
    email: 'Jamie@Example.com',
    locale: 'en-GB',
    sid: 'identity-session-1',
    ...overrides,
  });

  async function addList(ownerId: string): Promise<void> {
    await dataSource.manager.insert(List, {
      id: randomUUID(),
      ownerId,
      name: 'Courses',
      icon: 'cart',
      color: '#123456',
    });
  }

  beforeEach(async () => {
    database = await createTestDatabase();
    dataSource = new DataSource({
      type: 'postgres',
      url: database.url,
      entities: ENTITIES,
      migrations: MIGRATIONS,
    });
    await dataSource.initialize();
    await dataSource.runMigrations();
    service = new AuthService(
      dataSource.getRepository(User),
      dataSource.getRepository(Session),
      dataSource,
      { ttlMilliseconds: 60_000 } as SessionSettingsService,
      new DatabaseWriteLockService(),
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
    await database.drop();
  });

  describe('signIn', () => {
    it('creates the Plano user on a first visit, with the identity id and terms still to accept', async () => {
      const claims = claimsFor();

      const issued = await service.signIn(claims);

      expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(issued.user).toEqual({
        id: claims.sub,
        firstName: 'Jamie',
        lastName: 'Doe',
        username: 'jamie.doe',
        email: 'Jamie@Example.com',
        locale: 'en',
        avatarVersion: null,
        termsAccepted: false,
      });
      const session = await dataSource.manager.findOneByOrFail(Session, {
        userId: claims.sub,
      });
      expect(session.oidcSid).toBe('identity-session-1');
      expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('keeps an existing user and its Plano data, refreshing only what the account owns', async () => {
      const claims = claimsFor({ locale: 'de' });
      await service.signIn(claims);
      await dataSource.manager.update(
        User,
        { id: claims.sub },
        { locale: 'it', termsAcceptedAt: new Date() },
      );
      await addList(claims.sub);

      const again = await service.signIn({
        ...claims,
        username: 'jamie.renamed',
        firstName: 'Jay',
        email: 'jay@example.com',
        sid: 'identity-session-2',
      });

      expect(again.user).toEqual(
        expect.objectContaining({
          id: claims.sub,
          username: 'jamie.renamed',
          firstName: 'Jay',
          email: 'jay@example.com',
          // Plano's own settings stay Plano's.
          locale: 'it',
          termsAccepted: true,
        }),
      );
      expect(await dataSource.manager.countBy(User, {})).toBe(1);
      expect(
        await dataSource.manager.countBy(List, { ownerId: claims.sub }),
      ).toBe(1);
      expect(
        await dataSource.manager.countBy(Session, { userId: claims.sub }),
      ).toBe(2);
    });

    it('takes a username another copy still holds, as the identity service already moved it', async () => {
      await service.signIn(claimsFor({ username: 'sam' }));

      const second = await service.signIn(
        claimsFor({ username: 'SAM', email: 'other@example.com' }),
      );

      expect(second.user.username).toBe('sam');
      expect(
        await dataSource.manager.countBy(User, { normalizedUsername: 'sam' }),
      ).toBe(2);
    });

    it("starts in French when the account language is not one of Plano's", async () => {
      const issued = await service.signIn(claimsFor({ locale: 'pt-BR' }));

      expect(issued.user.locale).toBe('fr');
    });
  });

  describe('sessions', () => {
    it('reads the user of a valid session and refuses others', async () => {
      const issued = await service.signIn(claimsFor());

      await expect(service.getSessionUser(issued.token)).resolves.toEqual(
        issued.user,
      );
      await expect(
        service.getSessionUser('a'.repeat(43)),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(service.getSessionUser(undefined)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('ends only the session that signs out', async () => {
      const claims = claimsFor();
      const here = await service.signIn(claims);
      const there = await service.signIn(claims);

      await service.logout(here.token);

      await expect(service.getSessionUser(here.token)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      await expect(service.getSessionUser(there.token)).resolves.toBeDefined();
    });

    it('ends the sessions opened from an identity session that ended', async () => {
      const claims = claimsFor();
      const fromA = await service.signIn({ ...claims, sid: 'a' });
      const fromB = await service.signIn({ ...claims, sid: 'b' });

      await expect(
        service.endSessions({ sid: 'a', sub: claims.sub }),
      ).resolves.toBe(1);

      await expect(service.getSessionUser(fromA.token)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      await expect(service.getSessionUser(fromB.token)).resolves.toBeDefined();
    });

    it('ends every session of the account when the logout names no session', async () => {
      const claims = claimsFor();
      await service.signIn({ ...claims, sid: 'a' });
      await service.signIn({ ...claims, sid: 'b' });
      const someoneElse = await service.signIn(
        claimsFor({ username: 'other' }),
      );

      await expect(service.endSessions({ sub: claims.sub })).resolves.toBe(2);

      await expect(
        service.getSessionUser(someoneElse.token),
      ).resolves.toBeDefined();
    });
  });

  describe('deleteAccount', () => {
    it('erases the user and what it owns, and is harmless twice', async () => {
      const claims = claimsFor();
      const issued = await service.signIn(claims);
      await addList(claims.sub);
      const kept = await service.signIn(claimsFor({ username: 'kept' }));

      await service.deleteAccount(claims.sub);
      await service.deleteAccount(claims.sub);

      expect(await dataSource.manager.countBy(User, { id: claims.sub })).toBe(
        0,
      );
      expect(
        await dataSource.manager.countBy(List, { ownerId: claims.sub }),
      ).toBe(0);
      await expect(service.getSessionUser(issued.token)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      await expect(service.getSessionUser(kept.token)).resolves.toBeDefined();
    });
  });
});
