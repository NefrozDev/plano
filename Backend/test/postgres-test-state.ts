import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';

/**
 * Jest runs global setup and teardown in the same process, but loads each file
 * as its own module: globalThis is what they share.
 */
export const postgresTestState = globalThis as typeof globalThis & {
  container?: StartedPostgreSqlContainer;
};
