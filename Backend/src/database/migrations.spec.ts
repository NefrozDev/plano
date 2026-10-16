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
