import { HttpClient } from '@angular/common/http';
import { DOCUMENT, DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import type {
  MarkAllNotificationsReadRequest,
  MarkNotificationsReadRequest,
  NotificationArea,
  NotificationEntry,
  NotificationsResponse,
} from '@plano/common';
import { filter, firstValueFrom } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { AgendaSettingsStore } from '../settings/agenda-settings.store';
import { ObjectiveSettingsStore } from '../settings/objective-settings.store';
import { API_BASE_URL } from '../http/api-base-url';
import { LiveUpdatesService } from '../live/live-updates.service';

const NO_UNREAD: Readonly<Record<NotificationArea, number>> = { friends: 0, lists: 0, objectives: 0, agenda: 0 };

/** Where a notification leads: the list, the objective, the event, or the friends panel. */
export function notificationLink(notification: NotificationEntry): { commands: string[]; fragment?: string } {
  switch (notification.area) {
    case 'lists':
      return { commands: ['/lists', notification.targetId] };
    case 'objectives':
      return { commands: ['/objectives', notification.targetId] };
    case 'friends':
      return { commands: ['/settings'], fragment: 'friends' };
    case 'agenda':
      return { commands: ['/agenda/events', notification.targetId] };
  }
}

/**
 * The signed-in user's notifications, kept by the API: the home page bell lists
 * them, each tab counts its area's unread ones. Opening the place one is about
 * marks it read. Reloaded on every `notifications.changed` live event, and when
 * the app comes back to the foreground in case the stream missed one.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsStore {
  private readonly http = inject(HttpClient);
  private readonly url = `${inject(API_BASE_URL)}/notifications`;
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly agendaSettings = inject(AgendaSettingsStore);
  private readonly objectiveSettings = inject(ObjectiveSettingsStore);
  private readonly response = signal<NotificationsResponse>({ items: [], unread: NO_UNREAD });

  /** The objectives and agenda settings can turn their notifications off. */
  private readonly hidden = computed((): ReadonlySet<NotificationArea> => {
    return new Set<NotificationArea>([
      ...(this.objectiveSettings.settings().notifications ? [] : (['objectives'] as const)),
      ...(this.agendaSettings.settings().invitationNotifications ? [] : (['agenda'] as const)),
    ]);
  });
  readonly items = computed(() => this.response().items.filter(({ area }) => !this.hidden().has(area)));
  readonly unread = computed((): Record<NotificationArea, number> => {
    const counts = { ...this.response().unread };
    for (const area of this.hidden()) counts[area] = 0;
    return counts;
  });
  readonly total = computed(() => Object.values(this.unread()).reduce((sum, count) => sum + count, 0));

  /** Only a different account reloads: a profile or language change keeps what is shown. */
  private readonly userId = computed(() => this.auth.user()?.id ?? null);

  constructor() {
    effect(() => {
      const userId = this.userId();
      untracked(() => (userId ? void this.load() : this.response.set({ items: [], unread: NO_UNREAD })));
    });
    inject(LiveUpdatesService)
      .events.pipe(
        filter(({ type }) => type === 'notifications.changed'),
        takeUntilDestroyed(),
      )
      .subscribe(() => void this.load());
    const document = inject(DOCUMENT);
    const reloadWhenShown = () => {
      if (document.visibilityState === 'visible' && this.auth.user()) void this.load();
    };
    document.addEventListener('visibilitychange', reloadWhenShown);
    inject(DestroyRef).onDestroy(() => document.removeEventListener('visibilitychange', reloadWhenShown));
  }

  /** A failure keeps what is shown: the next event or visit catches up. */
  async load(): Promise<void> {
    try {
      this.response.set(await firstValueFrom(this.http.get<NotificationsResponse>(this.url)));
    } catch {
      // Offline or signed out meanwhile.
    }
  }

  /** Unread notifications about this place (a whole area without `targetId`). */
  hasUnread(area: NotificationArea, targetId?: string): boolean {
    if (!targetId) return this.response().unread[area] > 0;
    return this.response().items.some((item) => !item.read && item.area === area && item.targetId === targetId);
  }

  /** The user opened the place: what is about it is read, shown at once, saved behind. */
  async markRead(area: NotificationArea, targetId?: string): Promise<void> {
    if (!this.hasUnread(area, targetId)) return;
    const matches = (item: NotificationEntry) => item.area === area && (!targetId || item.targetId === targetId);
    this.response.update(({ items, unread }) => {
      const reading = items.filter((item) => !item.read && matches(item)).length;
      return {
        items: items.map((item) => (matches(item) ? { ...item, read: true } : item)),
        unread: { ...unread, [area]: targetId ? Math.max(0, unread[area] - reading) : 0 },
      };
    });
    const body: MarkNotificationsReadRequest = targetId ? { area, targetId } : { area };
    try {
      await firstValueFrom(this.http.post<void>(`${this.url}/read`, body));
    } catch {
      await this.load();
    }
  }

  /**
   * The bell was closed without opening any: everything unread in the areas it
   * shows is read, up to the newest one it showed; what came in since stays.
   */
  async markAllRead(): Promise<void> {
    const shown = this.items();
    if (!this.total() || !shown.length) return;
    const until = shown.reduce((latest, { updatedAt }) => (updatedAt > latest ? updatedAt : latest), shown[0].updatedAt);
    const areas = (Object.keys(NO_UNREAD) as NotificationArea[]).filter((area) => !this.hidden().has(area));
    const reads = (item: NotificationEntry) => areas.includes(item.area) && item.updatedAt <= until;
    this.response.update(({ items, unread }) => ({
      items: items.map((item) => (!item.read && reads(item) ? { ...item, read: true } : item)),
      unread: { ...unread, ...Object.fromEntries(areas.map((area) => [area, 0])) },
    }));
    const body: MarkAllNotificationsReadRequest = { areas, until };
    try {
      await firstValueFrom(this.http.post<void>(`${this.url}/read-all`, body));
    } catch {
      await this.load();
    }
  }

  /** Tapped in the bell: read, then off to where it happened. */
  async open(notification: NotificationEntry): Promise<void> {
    if (!notification.read) {
      this.response.update(({ items, unread }) => ({
        items: items.map((item) => (item.id === notification.id ? { ...item, read: true } : item)),
        unread: { ...unread, [notification.area]: Math.max(0, unread[notification.area] - 1) },
      }));
      void firstValueFrom(this.http.post<void>(`${this.url}/${notification.id}/read`, {})).catch(() => this.load());
    }
    const { commands, fragment } = notificationLink(notification);
    await this.router.navigate(commands, fragment ? { fragment } : {});
  }
}

/**
 * Call from a screen's constructor: while it is open, what is about its place
 * is read, including what arrives meanwhile. `targetId` is the list or
 * objective shown; a whole area without it.
 */
export function readNotificationsWhileOpen(area: NotificationArea, targetId?: () => string): void {
  const store = inject(NotificationsStore);
  effect(() => {
    const id = targetId?.();
    if (targetId && !id) return;
    if (store.hasUnread(area, id)) untracked(() => void store.markRead(area, id));
  });
}
