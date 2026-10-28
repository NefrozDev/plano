import { BadRequestException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { DatabaseWriteLockService } from '../database/database-write-lock.service';
import { MIGRATIONS } from '../database/migrations';
import {
  createTestDatabase,
  ENTITIES,
  type TestDatabase,
} from '../database/testing/test-database';
import { User } from './user.entity';
import { UsersService } from './users.service';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);

describe('UsersService', () => {
  let database: TestDatabase;
  let dataSource: DataSource;
  let users: UsersService;
  let userId: string;

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
    users = new UsersService(dataSource, new DatabaseWriteLockService());
    userId = randomUUID();
    await dataSource.manager.insert(User, {
      id: userId,
      firstName: 'Ada',
      lastName: 'Lovelace',
      username: 'ada',
      normalizedUsername: 'ada',
      email: 'ada@example.com',
      normalizedEmail: 'ada@example.com',
      passwordHash: 'hash',
      termsAcceptedAt: new Date(),
    });
  });

  afterEach(async () => {
    await dataSource.destroy();
    await database.drop();
  });

  it('starts in French and saves the chosen language', async () => {
    const stored = await dataSource.manager.findOneByOrFail(User, {
      id: userId,
    });
    expect(stored.locale).toBe('fr');

    await expect(
      users.updateProfile(userId, { locale: 'it' }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: userId,
        locale: 'it',
        avatarVersion: null,
      }),
    );
    // Sending nothing changes nothing.
    await expect(users.updateProfile(userId, {})).resolves.toEqual(
      expect.objectContaining({ locale: 'it' }),
    );
  });

  it('stores a picture with its detected type and a new version each time', async () => {
    const first = await users.setAvatar(userId, {
      buffer: PNG,
      size: PNG.length,
    });
    expect(first.avatarVersion).toEqual(expect.any(Number));
    await expect(users.findAvatar(userId)).resolves.toEqual({
      data: PNG,
      type: 'image/png',
    });

    await new Promise((resolve) => setTimeout(resolve, 5));
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 9]);
    const second = await users.setAvatar(userId, {
      buffer: jpeg,
      size: jpeg.length,
    });
    expect(second.avatarVersion).toBeGreaterThan(
      first.avatarVersion ?? Infinity,
    );
    expect((await users.findAvatar(userId)).type).toBe('image/jpeg');
  });

  it('refuses empty or non-image uploads without touching the stored picture', async () => {
    await users.setAvatar(userId, { buffer: PNG, size: PNG.length });

    await expect(users.setAvatar(userId, undefined)).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      users.setAvatar(userId, { buffer: Buffer.alloc(0), size: 0 }),
    ).rejects.toThrow('Choisissez une image.');
    const svg = Buffer.from('<svg/>');
    await expect(
      users.setAvatar(userId, { buffer: svg, size: svg.length }),
    ).rejects.toThrow('Choisissez une image JPEG, PNG ou WebP.');

    expect((await users.findAvatar(userId)).data).toEqual(PNG);
  });

  it('removes the picture, after which there is none to serve', async () => {
    await users.setAvatar(userId, { buffer: PNG, size: PNG.length });

    await expect(users.removeAvatar(userId)).resolves.toEqual(
      expect.objectContaining({ avatarVersion: null }),
    );
    await expect(users.findAvatar(userId)).rejects.toThrow(NotFoundException);
  });

  it('reports unknown users', async () => {
    const unknown = randomUUID();
    await expect(
      users.updateProfile(unknown, { locale: 'en' }),
    ).rejects.toThrow(NotFoundException);
    await expect(users.findAvatar(unknown)).rejects.toThrow(NotFoundException);
  });
});
