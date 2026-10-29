import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DataSource, LessThanOrEqual } from 'typeorm';
import { DatabaseWriteLockService } from '../database/database-write-lock.service';
import { MailService } from '../mail/mail.service';
import { User } from '../users/user.entity';
import { normalizeIdentifier } from '../users/username';
import { PasswordService } from './password.service';
import { PasswordReset } from './password-reset.entity';
import { passwordResetMail } from './password-reset.mail';
import { Session } from './session.entity';

export const RESET_VALID_MINUTES = 30;
export const INVALID_RESET_MESSAGE =
  'Ce lien n’est plus valable. Demandez-en un nouveau.';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Password recovery by e-mail. Asking never says whether the address has an
 * account; the link carries a single-use token valid for RESET_VALID_MINUTES,
 * and using it signs the account out everywhere.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);
  private readonly frontendUrl: string;
  private readonly production: boolean;

  constructor(
    private readonly dataSource: DataSource,
    private readonly writeLock: DatabaseWriteLockService,
    private readonly passwords: PasswordService,
    private readonly mail: MailService,
    config: ConfigService,
  ) {
    this.frontendUrl = (
      config.get<string>('FRONTEND_URL') ?? 'http://localhost:4200'
    ).replace(/\/+$/, '');
    this.production = config.get<string>('NODE_ENV') === 'production';
  }

  /**
   * Resolves once the token is stored; the e-mail leaves in the background, so
   * an existing address does not answer measurably later than an unknown one.
   */
  async request(email: string): Promise<void> {
    const user = await this.dataSource.manager.findOne(User, {
      where: { normalizedEmail: normalizeIdentifier(email) },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        username: true,
        locale: true,
      },
    });
    if (!user) return;

    const token = randomBytes(32).toString('base64url');
    await this.writeLock.runExclusive(() =>
      this.dataSource.transaction(async (manager) => {
        await manager.delete(PasswordReset, {
          expiresAt: LessThanOrEqual(new Date()),
        });
        // Only the latest link works.
        await manager.delete(PasswordReset, { userId: user.id });
        await manager.insert(PasswordReset, {
          id: randomUUID(),
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + RESET_VALID_MINUTES * 60 * 1000),
        });
      }),
    );

    // A fragment never reaches a server, so proxies cannot log the token.
    const link = `${this.frontendUrl}/reset-password#token=${token}`;
    void this.deliver(user, link);
  }

  async confirm(token: string, password: string): Promise<void> {
    const tokenHash = hashToken(token);
    const pending = await this.dataSource.manager.findOne(PasswordReset, {
      where: { tokenHash },
    });
    if (!pending || pending.expiresAt <= new Date()) {
      throw new BadRequestException(INVALID_RESET_MESSAGE);
    }
    // Hashing is slow: done before taking the write lock.
    const passwordHash = await this.passwords.hash(password);
    await this.writeLock.runExclusive(() =>
      this.dataSource.transaction(async (manager) => {
        // Used meanwhile (a double click, another tab): only once.
        const deleted = await manager.delete(PasswordReset, {
          id: pending.id,
        });
        if (!deleted.affected) {
          throw new BadRequestException(INVALID_RESET_MESSAGE);
        }
        await manager.update(User, { id: pending.userId }, { passwordHash });
        await manager.delete(PasswordReset, { userId: pending.userId });
        await manager.delete(Session, { userId: pending.userId });
      }),
    );
  }

  private async deliver(
    user: Pick<
      User,
      'email' | 'firstName' | 'lastName' | 'username' | 'locale'
    >,
    link: string,
  ): Promise<void> {
    if (!this.mail.enabled && !this.production) {
      // Development without SMTP: the link is the only way to test the flow.
      this.logger.log(`Password reset link for ${user.username}: ${link}`);
      return;
    }
    try {
      await this.mail.send(
        passwordResetMail({
          to: user.email,
          name: `${user.firstName} ${user.lastName}`.trim() || user.username,
          locale: user.locale,
          link,
          validMinutes: RESET_VALID_MINUTES,
        }),
      );
    } catch (error) {
      this.logger.error(
        `Password reset e-mail to user ${user.username} failed: ${String(error)}`,
      );
    }
  }
}
