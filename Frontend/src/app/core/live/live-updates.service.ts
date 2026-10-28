import { DestroyRef, Injectable, InjectionToken, effect, inject, untracked } from '@angular/core';
import type { LiveEvent } from '@plano/common';
import { Observable, Subject } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { API_BASE_URL } from '../http/api-base-url';

/** Injected so specs can hand over a fake stream. */
export const EVENT_SOURCE_FACTORY = new InjectionToken<(url: string) => EventSource>('EVENT_SOURCE_FACTORY', {
  providedIn: 'root',
  factory: () => (url) => new EventSource(url, { withCredentials: true }),
});

/** The named events the API sends; anything else (the heartbeat) is ignored. */
const EVENT_TYPES: readonly LiveEvent['type'][] = ['list.changed', 'list.removed'];

/**
 * One Server-Sent Events stream while signed in, closed on sign-out. The
 * browser reconnects a dropped stream on its own; events missed meanwhile are
 * caught up by the next reload of each screen.
 */
@Injectable({ providedIn: 'root' })
export class LiveUpdatesService {
  private readonly createSource = inject(EVENT_SOURCE_FACTORY);
  private readonly url = `${inject(API_BASE_URL)}/live/stream`;
  private readonly auth = inject(AuthService);
  private readonly eventsSubject = new Subject<LiveEvent>();
  private source: EventSource | null = null;

  readonly events: Observable<LiveEvent> = this.eventsSubject.asObservable();

  constructor() {
    effect(() => {
      const signedIn = !!this.auth.user();
      untracked(() => (signedIn ? this.open() : this.close()));
    });
    inject(DestroyRef).onDestroy(() => this.close());
  }

  private open(): void {
    if (this.source) return;
    const source = this.createSource(this.url);
    for (const type of EVENT_TYPES) {
      source.addEventListener(type, (message) => this.receive(message));
    }
    this.source = source;
  }

  private receive(message: Event): void {
    if (!(message instanceof MessageEvent) || typeof message.data !== 'string') return;
    try {
      this.eventsSubject.next(JSON.parse(message.data) as LiveEvent);
    } catch {
      // A malformed event is dropped: the next one, or the next reload, catches up.
    }
  }

  private close(): void {
    this.source?.close();
    this.source = null;
  }
}
