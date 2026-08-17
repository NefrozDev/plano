import { Injectable } from '@nestjs/common';

/**
 * sql.js owns a single in-process SQLite connection. Serializing writes prevents
 * overlapping requests from sharing or corrupting one another's transactions.
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
