import { Injectable } from '@nestjs/common';

/**
 * Serializes the writes of this API process. It was required when sql.js held
 * one shared SQLite connection; with PostgreSQL it still keeps read-then-write
 * sequences, such as picking the next position, from interleaving.
 */
@Injectable()
export class DatabaseWriteLockService {
  private queue: Promise<void> = Promise.resolve();

  runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );

    return result;
  }
}
