import { DatabaseWriteLockService } from './database-write-lock.service';

describe('DatabaseWriteLockService', () => {
  it('serializes overlapping sql.js writes', async () => {
    const lock = new DatabaseWriteLockService();
    const events: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const firstCanFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = lock.runExclusive(async () => {
      events.push('first:start');
      await firstCanFinish;
      events.push('first:end');
    });
    const second = lock.runExclusive(() => {
      events.push('second:start');
      events.push('second:end');
      return Promise.resolve();
    });

    await Promise.resolve();
    expect(events).toEqual(['first:start']);
    releaseFirst?.();
    await Promise.all([first, second]);
    expect(events).toEqual([
      'first:start',
      'first:end',
      'second:start',
      'second:end',
    ]);
  });
});
