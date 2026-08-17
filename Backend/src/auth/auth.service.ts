import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  DataSource,
  LessThanOrEqual,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { DatabaseWriteLockService } from '../database/database-write-lock.service';
import { User } from '../users/user.entity';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import { PasswordService } from './password.service';
import { Session } from './session.entity';
import { SessionSettingsService } from './session-settings.service';
import type { AuthUser, IssuedAuthentication } from './auth.types';

const INVALID_CREDENTIALS_MESSAGE =
  "Le nom d'utilisateur ou le mot de passe est incorrect.";
const REGISTRATION_CONFLICT_MESSAGE =
  "Ce nom d'utilisateur ou cette adresse e-mail est déjà utilisé.";
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('en-US');
}

function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    email: user.email,
  };
}

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function isUniqueConstraintError(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }

  return /unique constraint/i.test(String(error.driverError));
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Session)
    private readonly sessions: Repository<Session>,
    private readonly dataSource: DataSource,
    private readonly passwords: PasswordService,
    private readonly sessionSettings: SessionSettingsService,
    private readonly writeLock: DatabaseWriteLockService,
  ) {}

  async register(details: RegisterDto): Promise<IssuedAuthentication> {
    const normalizedUsername = normalize(details.username);
    const normalizedEmail = normalize(details.email);
    const duplicate = await this.users.findOne({
      where: [{ normalizedUsername }, { normalizedEmail }],
    });

    if (duplicate) {
      throw new ConflictException(REGISTRATION_CONFLICT_MESSAGE);
    }

    const passwordHash = await this.passwords.hash(details.password);
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      Date.now() + this.sessionSettings.ttlMilliseconds,
    );

    try {
      const user = await this.writeLock.runExclusive(() =>
        this.dataSource.transaction(async (manager) => {
          const existing = await manager.findOne(User, {
            where: [{ normalizedUsername }, { normalizedEmail }],
          });

          if (existing) {
            throw new ConflictException(REGISTRATION_CONFLICT_MESSAGE);
          }

          await manager.delete(Session, {
            expiresAt: LessThanOrEqual(new Date()),
          });
          const createdUser = manager.create(User, {
            id: randomUUID(),
            firstName: details.firstName.trim(),
            lastName: details.lastName.trim(),
            username: normalizedUsername,
            normalizedUsername,
            email: normalizedEmail,
            normalizedEmail,
            passwordHash,
            termsAcceptedAt: new Date(),
          });
          const savedUser = await manager.save(createdUser);

          await manager.save(
            manager.create(Session, {
              id: randomUUID(),
              tokenHash: hashSessionToken(token),
              userId: savedUser.id,
              expiresAt,
            }),
          );

          return savedUser;
        }),
      );

      return { token, expiresAt, user: toAuthUser(user) };
    } catch (error) {
      if (
        error instanceof ConflictException ||
        isUniqueConstraintError(error)
      ) {
        throw new ConflictException(REGISTRATION_CONFLICT_MESSAGE);
      }

      throw error;
    }
  }

  async login(credentials: LoginDto): Promise<IssuedAuthentication> {
    const normalizedUsername = normalize(credentials.username);
    const user = await this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.normalizedUsername = :normalizedUsername', {
        normalizedUsername,
      })
      .getOne();
    const passwordIsValid = await this.passwords.verify(
      credentials.password,
      user?.passwordHash,
    );

    if (!user || !passwordIsValid) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      Date.now() + this.sessionSettings.ttlMilliseconds,
    );
    const session = this.sessions.create({
      id: randomUUID(),
      tokenHash: hashSessionToken(token),
      userId: user.id,
      expiresAt,
    });

    await this.writeLock.runExclusive(async () => {
      await this.sessions.delete({ expiresAt: LessThanOrEqual(new Date()) });
      await this.sessions.save(session);
    });

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
}
