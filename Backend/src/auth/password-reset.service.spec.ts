import type { Mock } from 'vitest';
import { BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { DatabaseWriteLockService } from '../database/database-write-lock.service';
import { MIGRATIONS } from '../database/migrations';
import {
  createTestDatabase,
  ENTITIES,
  type TestDatabase,
} from '../database/testing/test-database';
import type { MailService, OutgoingMail } from '../mail/mail.service';
import { User } from '../users/user.entity';
import { PasswordService } from './password.service';
import { PasswordReset } from './password-reset.entity';
import {
  INVALID_RESET_MESSAGE,
  PasswordResetService,
  RESET_VALID_MINUTES,
} from './password-reset.service';
import { Session } from './session.entity';

describe('PasswordResetService', () => {
  let database: TestDatabase;
  let dataSource: DataSource;
  let passwords: PasswordService;
  let mail: {
    enabled: boolean;
    send: Mock<(mail: OutgoingMail) => Promise<void>>;
  };
  let resets: PasswordResetService;
  let userId: string;

  const build = (env: Record<string, string> = {}) =>
    new PasswordResetService(
      dataSource,
      new DatabaseWriteLockService(),
      passwords,
      mail as unknown as MailService,
      new ConfigService({ FRONTEND_URL: 'https://plano.test/', ...env }),
    );
  /** The token of the last e-mail, read from its link. */
  const sentToken = async (): Promise<string> => {
    await vi.waitFor(() => expect(mail.send).toHaveBeenCalled());
    const text = mail.send.mock.lastCall![0].text;
    return /reset-password#token=([A-Za-z0-9_-]{43})/.exec(text)![1];
  };
  /** passwordHash is not selected by default. */
  const storedHash = async () =>
    (
      await dataSource.manager.findOneOrFail(User, {
        where: { id: userId },
        select: { id: true, passwordHash: true },
      })
    ).passwordHash;

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
    passwords = new PasswordService(
      new ConfigService({
        AUTH_SCRYPT_COST: '1024',
        AUTH_SCRYPT_BLOCK_SIZE: '8',
        AUTH_SCRYPT_PARALLELIZATION: '1',
      }),
    );
    mail = { enabled: true, send: vi.fn().mockResolvedValue(undefined) };
    resets = build();
    userId = randomUUID();
    await dataSource.manager.insert(User, {
      id: userId,
      firstName: 'Ada',
      lastName: 'Lovelace',
      username: 'ada',
      normalizedUsername: 'ada',
      email: 'Ada@Example.com',
      normalizedEmail: 'ada@example.com',
      passwordHash: await passwords.hash('old-password'),
      termsAcceptedAt: new Date(),
      locale: 'en',
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await dataSource.destroy();
    await database.drop();
  });

  describe('request', () => {
    it('e-mails a single-use link in the account language, storing only the token hash', async () => {
      await resets.request('  ADA@example.com ');

      const token = await sentToken();
      expect(mail.send).toHaveBeenCalledTimes(1);
      const sent = mail.send.mock.lastCall![0];
      expect(sent.to).toBe('Ada@Example.com');
      expect(sent.subject).toBe('Reset your Plano password');
      expect(sent.text).toContain('Hello Ada Lovelace,');
      // No double slash from the configured URL, and the token in a fragment.
      expect(sent.text).toContain(
        `https://plano.test/reset-password#token=${token}`,
      );
      expect(sent.text).toContain(`${RESET_VALID_MINUTES} minutes`);
      const [row] = await dataSource.manager.find(PasswordReset);
      expect(row.userId).toBe(userId);
      expect(row.tokenHash).toBe(
        createHash('sha256').update(token).digest('hex'),
      );
      expect(row.tokenHash).not.toContain(token);
      const minutesLeft = (row.expiresAt.getTime() - Date.now()) / 60_000;
      expect(minutesLeft).toBeGreaterThan(RESET_VALID_MINUTES - 1);
      expect(minutesLeft).toBeLessThanOrEqual(RESET_VALID_MINUTES);
    });

    it('answers the same for an unknown address, sending and storing nothing', async () => {
      await expect(
        resets.request('nobody@example.com'),
      ).resolves.toBeUndefined();

      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(mail.send).not.toHaveBeenCalled();
      await expect(dataSource.manager.count(PasswordReset)).resolves.toBe(0);
    });

    it('keeps only the latest link, and drops expired ones', async () => {
      await dataSource.manager.insert(PasswordReset, {
        id: randomUUID(),
        userId,
        tokenHash: 'x'.repeat(64),
        expiresAt: new Date(Date.now() - 1000),
      });
      await resets.request('ada@example.com');
      const first = await sentToken();
      mail.send.mockClear();

      await resets.request('ada@example.com');
      const second = await sentToken();

      await expect(dataSource.manager.count(PasswordReset)).resolves.toBe(1);
      await expect(resets.confirm(first, 'new-password')).rejects.toThrow(
        INVALID_RESET_MESSAGE,
      );
      await resets.confirm(second, 'new-password');
    });

    it('still answers when the e-mail cannot be sent, and logs it without the token', async () => {
      mail.send.mockRejectedValue(new Error('SMTP down'));
      const error = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      await expect(resets.request('ada@example.com')).resolves.toBeUndefined();

      await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(1));
      expect(String(error.mock.lastCall![0])).toContain('SMTP down');
      expect(String(error.mock.lastCall![0])).not.toContain('#token=');
    });

    it('logs the link instead of sending outside production without SMTP', async () => {
      mail.enabled = false;
      const log = vi
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);

      await resets.request('ada@example.com');

      await vi.waitFor(() => expect(log).toHaveBeenCalledTimes(1));
      expect(String(log.mock.lastCall![0])).toMatch(
        /reset-password#token=[A-Za-z0-9_-]{43}$/,
      );
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('never logs the link in production, even without SMTP', async () => {
      mail.enabled = false;
      const log = vi
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
      resets = build({ NODE_ENV: 'production' });

      await resets.request('ada@example.com');

      // The mailer is asked (and warns it has no SMTP); nothing shows the link.
      await vi.waitFor(() => expect(mail.send).toHaveBeenCalledTimes(1));
      expect(log).not.toHaveBeenCalled();
    });
  });

  describe('confirm', () => {
    it('sets the new password once, ends every session and every pending link', async () => {
      await dataSource.manager.insert(Session, {
        id: randomUUID(),
        tokenHash: 'a'.repeat(64),
        userId,
        expiresAt: new Date(Date.now() + 60_000),
      });
      await resets.request('ada@example.com');
      const token = await sentToken();
      const before = await storedHash();

      await resets.confirm(token, 'new-password');

      const after = await storedHash();
      expect(after).not.toBe(before);
      await expect(passwords.verify('new-password', after)).resolves.toBe(true);
      await expect(dataSource.manager.count(Session)).resolves.toBe(0);
      await expect(dataSource.manager.count(PasswordReset)).resolves.toBe(0);
      // Single use.
      await expect(resets.confirm(token, 'another-password')).rejects.toThrow(
        BadRequestException,
      );
      await expect(
        passwords.verify('new-password', await storedHash()),
      ).resolves.toBe(true);
    });

    it('refuses an unknown or expired token without changing the password', async () => {
      await resets.request('ada@example.com');
      const token = await sentToken();
      await dataSource.manager.update(
        PasswordReset,
        { userId },
        { expiresAt: new Date(Date.now() - 1000) },
      );
      const before = await storedHash();

      await expect(
        resets.confirm('z'.repeat(43), 'new-password'),
      ).rejects.toThrow(INVALID_RESET_MESSAGE);
      await expect(resets.confirm(token, 'new-password')).rejects.toThrow(
        INVALID_RESET_MESSAGE,
      );

      expect(await storedHash()).toBe(before);
    });

    it('lets only one of two simultaneous uses through', async () => {
      await resets.request('ada@example.com');
      const token = await sentToken();

      const results = await Promise.allSettled([
        resets.confirm(token, 'first-password'),
        resets.confirm(token, 'second-password'),
      ]);

      expect(results.map(({ status }) => status).sort()).toEqual([
        'fulfilled',
        'rejected',
      ]);
    });
  });
});
