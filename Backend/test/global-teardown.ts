import { postgresTestState } from './postgres-test-state';

export default async function stopPostgres(): Promise<void> {
  await postgresTestState.container?.stop();
}
