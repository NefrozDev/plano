import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';
import type { LiveEvent, PublicUser } from '@plano/common';
import { Observable, Subject, filter, firstValueFrom, map } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { LiveUpdatesService } from '../live/live-updates.service';
import { FriendsService } from './friends.service';

type FriendEvent = Extract<LiveEvent, { type: 'friend.requested' | 'friend.accepted' | 'friends.changed' }>;

const FRIEND_EVENTS: ReadonlySet<LiveEvent['type']> = new Set(['friend.requested', 'friend.accepted', 'friends.changed']);

function displayName(user: PublicUser): string {
  return `${user.firstName} ${user.lastName}`.trim() || user.username;
}

/**
 * What is new on the friends side for the signed-in user: requests waiting for
 * an answer (from the API, so they also count when they came in while away)
 * and acceptances not seen yet (from live events, until the friends list is
 * opened). A live event also raises a short message for the app-wide toast.
 */
@Injectable({ providedIn: 'root' })
export class FriendNotificationsService {
  private readonly auth = inject(AuthService);
  private readonly friendsApi = inject(FriendsService);
  private readonly transloco = inject(TranslocoService);
  private readonly userId = computed(() => this.auth.user()?.id ?? null);
  private readonly changesSubject = new Subject<void>();

  readonly incoming = signal(0);
  readonly accepted = signal<readonly PublicUser[]>([]);
  /** Shown as a badge wherever the friends list can be reached. */
  readonly count = computed(() => this.incoming() + this.accepted().length);
  /** Message of the last friend event, until dismissed. */
  readonly message = signal('');
  /** Fires on every friend event, so open friend lists reload. */
  readonly changes: Observable<void> = this.changesSubject.asObservable();

  constructor() {
    effect(() => {
      const userId = this.userId();
      untracked(() => (userId ? void this.refresh() : this.reset()));
    });
    inject(LiveUpdatesService)
      .events.pipe(
        filter((event): event is FriendEvent => FRIEND_EVENTS.has(event.type)),
        map((event) => this.receive(event)),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.changesSubject.next());
  }

  /** Recounts the requests waiting for an answer; a failure keeps the last count. */
  async refresh(): Promise<void> {
    try {
      const { incoming } = await firstValueFrom(this.friendsApi.requests());
      this.incoming.set(incoming.length);
    } catch {
      // The next event or screen visit catches up.
    }
  }

  /** The friends list is on screen: acceptances count as seen. */
  markSeen(): void {
    this.accepted.set([]);
  }

  dismiss(): void {
    this.message.set('');
  }

  private receive(event: FriendEvent): void {
    if (event.type === 'friend.accepted') {
      this.accepted.update((users) => [...users.filter(({ id }) => id !== event.user.id), event.user]);
      this.message.set(this.transloco.translate('notifications.friendAccepted', { name: displayName(event.user) }));
    } else if (event.type === 'friend.requested') {
      this.message.set(this.transloco.translate('notifications.friendRequested', { name: displayName(event.user) }));
    }
    // An acceptance may also settle a request this user had received.
    void this.refresh();
  }

  private reset(): void {
    this.incoming.set(0);
    this.accepted.set([]);
    this.message.set('');
  }
}
