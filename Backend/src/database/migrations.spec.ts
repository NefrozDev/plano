import { DataSource } from 'typeorm';
import { MIGRATIONS } from './migrations';
import {
  createTestDatabase,
  ENTITIES,
  TestDatabase,
} from './testing/test-database';

describe('migrations', () => {
  let database: TestDatabase;
  let dataSource: DataSource;

  beforeEach(async () => {
    database = await createTestDatabase();
    dataSource = new DataSource({
      type: 'postgres',
      url: database.url,
      entities: ENTITIES,
      migrations: MIGRATIONS,
    });
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.destroy();
    await database.drop();
  });

  it('build exactly the schema the entities describe', async () => {
    await dataSource.runMigrations();

    // The SQL TypeORM would run to make the schema match the entities.
    const pending = await dataSource.driver.createSchemaBuilder().log();

    expect(pending.upQueries.map((query) => query.query)).toEqual([]);
  });

  it('keep the terms acceptance dates when signing in moves to the Synapse account', async () => {
    // A database as production had it: every migration before the switch, one user.
    const signInWithSynapse = MIGRATIONS.findIndex(
      (migration) => migration.name === 'SignInWithSynapse1788300000000',
    );
    const before = new DataSource({
      type: 'postgres',
      url: database.url,
      migrations: MIGRATIONS.slice(0, signInWithSynapse),
    });
    await before.initialize();
    await before.runMigrations();
    await before.query(
      `INSERT INTO users (id, "firstName", "lastName", username, "normalizedUsername",
         email, "normalizedEmail", "passwordHash", "termsAcceptedAt")
       VALUES ('u1', 'Ada', 'Lovelace', 'ada', 'ada', 'ada@example.com',
         'ada@example.com', 'scrypt$hash', '2026-10-01T08:00:00Z')`,
    );
    await before.destroy();
    const termsDate = async () =>
      (
        await dataSource.query<{ at: string }[]>(
          `SELECT to_char("termsAcceptedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') AS at FROM users WHERE id = 'u1'`,
        )
      )[0].at;

    await dataSource.runMigrations();
    expect(await termsDate()).toBe('2026-10-01T08:00:00');

    await dataSource.undoLastMigration();
    expect(await termsDate()).toBe('2026-10-01T08:00:00');
  });

  it('can be reverted down to an empty schema', async () => {
    await dataSource.runMigrations();
    for (let i = 0; i < MIGRATIONS.length; i++) {
      await dataSource.undoLastMigration();
    }

    const tables = await dataSource.query<{ tablename: string }[]>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'migrations'`,
    );
    expect(tables).toEqual([]);
  });
});
