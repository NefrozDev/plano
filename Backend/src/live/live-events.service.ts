import {
  Injectable,
  type MessageEvent,
  OnApplicationShutdown,
} from '@nestjs/common';
import type { LiveEvent } from '@plano/common';
import {
  Observable,
  Subject,
  filter,
  interval,
  map,
  merge,
  takeUntil,
} from 'rxjs';

/** Below the 60 s idle timeout of nginx and most proxies. */
export const HEARTBEAT_MS = 25_000;

interface Addressed {
  userIds: ReadonlySet<string>;
  event: LiveEvent;
}

/**
 * In-memory fan-out of live events to the open streams of their users. Like
 * the rate limiter's store, it only works while the API runs as one instance.
 */
@Injectable()
export class LiveEventsService implements OnApplicationShutdown {
  private readonly events = new Subject<Addressed>();
  private readonly shutdown = new Subject<void>();

  publish(userIds: Iterable<string>, event: LiveEvent): void {
    const recipients = new Set(userIds);
    if (recipients.size) this.events.next({ userIds: recipients, event });
  }

  /** The user's events, plus a heartbeat so proxies keep the idle connection open. */
  streamFor(userId: string): Observable<MessageEvent> {
    return merge(
      this.events.pipe(
        filter(({ userIds }) => userIds.has(userId)),
        map(({ event }): MessageEvent => ({ type: event.type, data: event })),
      ),
      interval(HEARTBEAT_MS).pipe(
        map((): MessageEvent => ({ type: 'ping', data: '' })),
      ),
    ).pipe(takeUntil(this.shutdown));
  }

  /** Ends every stream, or open connections would keep the server from closing. */
  onApplicationShutdown(): void {
    this.shutdown.next();
    this.shutdown.complete();
    this.events.complete();
  }
}
