import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DataSource, LessThanOrEqual, Repository } from 'typeorm';
import { DatabaseWriteLockService } from '../database/database-write-lock.service';
import { User } from '../users/user.entity';
import { SUPPORTED_LOCALES, toAuthUser } from '../users/user.mapper';
import { normalizeIdentifier as normalize } from '../users/username';
import type { EndedSession } from './identity-tokens';
import type { IdentityClaims } from './oidc-client.service';
import { Session } from './session.entity';
import { SessionSettingsService } from './session-settings.service';
import type { AuthUser, IssuedAuthentication } from './auth.types';

const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function supportedLocale(locale: string | null): User['locale'] {
  const base = locale?.slice(0, 2);
  return SUPPORTED_LOCALES.find((supported) => supported === base) ?? 'fr';
}

/**
 * Plano's own sessions, opened once the Synapse identity service has signed
 * someone in. The account lives there; Plano keeps a copy of the name, the
 * username and the e-mail address, refreshed at each sign-in, and the rest
 * (language, picture, acceptance of Plano's terms) as its own.
 */
@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Session)
    private readonly sessions: Repository<Session>,
    private readonly dataSource: DataSource,
    private readonly sessionSettings: SessionSettingsService,
    private readonly writeLock: DatabaseWriteLockService,
  ) {}

  /**
   * Opens a Plano session for the person the identity service vouched for,
   * creating their Plano user on their first visit, with the identity
   * service's id: Plano's former accounts kept theirs, and everything with it.
   */
  async signIn(claims: IdentityClaims): Promise<IssuedAuthentication> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      Date.now() + this.sessionSettings.ttlMilliseconds,
    );
    const identity = {
      firstName: claims.firstName.trim(),
      lastName: claims.lastName.trim(),
      // Plano keeps usernames lower case.
      username: normalize(claims.username),
      normalizedUsername: normalize(claims.username),
      email: claims.email.trim(),
      normalizedEmail: normalize(claims.email),
    };

    const user = await this.writeLock.runExclusive(() =>
      this.dataSource.transaction(async (manager) => {
        await manager.delete(Session, {
          expiresAt: LessThanOrEqual(new Date()),
        });
        const existing = await manager.findOne(User, {
          where: { id: claims.sub },
        });
        const signedIn = await manager.save(
          existing
            ? Object.assign(existing, identity)
            : manager.create(User, {
                id: claims.sub,
                ...identity,
                locale: supportedLocale(claims.locale),
                // Plano's own terms are accepted on Plano's first screen.
                termsAcceptedAt: null,
              }),
        );
        await manager.save(
          manager.create(Session, {
            id: randomUUID(),
            tokenHash: hashSessionToken(token),
            userId: signedIn.id,
            oidcSid: claims.sid,
            expiresAt,
          }),
        );
        return signedIn;
      }),
    );

    return { token, expiresAt, user: toAuthUser(user) };
  }

  async getSessionUser(token: string | undefined): Promise<AuthUser> {
    if (!token || !SESSION_TOKEN_PATTERN.test(token)) {
      throw new UnauthorizedException('Session invalide ou expirée.');
    }

    const tokenHash = hashSessionToken(token);
    const session = await this.sessions
      .createQueryBuilder('session')
      .leftJoinAndSelect('session.user', 'user')
      .where('session.tokenHash = :tokenHash', { tokenHash })
      .getOne();

    if (!session) {
      throw new UnauthorizedException('Session invalide ou expirée.');
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      await this.writeLock.runExclusive(() =>
        this.sessions.delete({ id: session.id }).then(() => undefined),
      );
      throw new UnauthorizedException('Session invalide ou expirée.');
    }

    return toAuthUser(session.user);
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token || !SESSION_TOKEN_PATTERN.test(token)) {
      return;
    }

    await this.writeLock.runExclusive(() =>
      this.sessions
        .delete({ tokenHash: hashSessionToken(token) })
        .then(() => undefined),
    );
  }

  /**
   * A session ended at the identity service (back-channel logout): ends the
   * Plano sessions opened from it, or every session of the account when the
   * token names no session.
   */
  async endSessions({ sub, sid }: EndedSession): Promise<number> {
    const criteria = sid ? { oidcSid: sid } : { userId: sub };
    const result = await this.writeLock.runExclusive(() =>
      this.sessions.delete(criteria),
    );
    return result.affected ?? 0;
  }

  /**
   * The account was deleted at the identity service: everything Plano keeps
   * about it goes through ON DELETE CASCADE (its lists, objectives, groups it
   * created, agenda, friendships, notifications, sessions); shared items only
   * lose its name. Deleting twice is harmless.
   */
  async deleteAccount(userId: string): Promise<void> {
    await this.writeLock.runExclusive(() =>
      this.users.delete({ id: userId }).then(() => undefined),
    );
  }
}
