import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';
import type { LiveEvent, PublicUser } from '@plano/common';
import { Observable, Subject, filter, map } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { LiveUpdatesService } from '../live/live-updates.service';

type FriendEvent = Extract<LiveEvent, { type: 'friend.requested' | 'friend.accepted' | 'friends.changed' }>;

const FRIEND_EVENTS: ReadonlySet<LiveEvent['type']> = new Set(['friend.requested', 'friend.accepted', 'friends.changed']);

function displayName(user: PublicUser): string {
  return `${user.firstName} ${user.lastName}`.trim() || user.username;
}

/**
 * Friend events while the app is open: a short message for the app-wide toast,
 * and a signal for open friend lists to reload. Counting what is unread is the
 * notifications store's job.
 */
@Injectable({ providedIn: 'root' })
export class FriendNotificationsService {
  private readonly auth = inject(AuthService);
  private readonly transloco = inject(TranslocoService);
  private readonly userId = computed(() => this.auth.user()?.id ?? null);
  private readonly changesSubject = new Subject<void>();

  /** Message of the last friend event, until dismissed. */
  readonly message = signal('');
  /** Fires on every friend event, so open friend lists reload. */
  readonly changes: Observable<void> = this.changesSubject.asObservable();

  constructor() {
    effect(() => {
      this.userId();
      untracked(() => this.message.set(''));
    });
    inject(LiveUpdatesService)
      .events.pipe(
        filter((event): event is FriendEvent => FRIEND_EVENTS.has(event.type)),
        map((event) => this.receive(event)),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.changesSubject.next());
  }

  dismiss(): void {
    this.message.set('');
  }

  private receive(event: FriendEvent): void {
    if (event.type === 'friend.accepted') {
      this.message.set(this.transloco.translate('notifications.friendAccepted', { name: displayName(event.user) }));
    } else if (event.type === 'friend.requested') {
      this.message.set(this.transloco.translate('notifications.friendRequested', { name: displayName(event.user) }));
    }
  }
}
