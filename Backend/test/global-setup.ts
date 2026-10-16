import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { postgresTestState } from './postgres-test-state';

/**
 * Starts one throwaway PostgreSQL server for the whole Jest run. Each test bed
 * then creates its own database on it (see createTestDatabase).
 * A TEST_DATABASE_URL set beforehand, e.g. by CI, is used instead.
 */
export default async function startPostgres(): Promise<void> {
  if (process.env.TEST_DATABASE_URL) {
    return;
  }

  const container = await new PostgreSqlContainer('postgres:18-alpine')
    // Durability is pointless for throwaway data and slows every test down.
    .withCommand(['postgres', '-c', 'fsync=off'])
    .start();
  postgresTestState.container = container;
  // Jest starts its test workers after this, so they inherit the variable.
  process.env.TEST_DATABASE_URL = container.getConnectionUri();
}
