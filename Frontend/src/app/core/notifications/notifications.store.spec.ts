import { HttpTestingController } from '@angular/common/http/testing';
import { Component, Signal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { NotificationEntry, NotificationsResponse } from '@plano/common';
import { notification } from '../../testing/notifications-fixtures';
import { ObjectivesStore } from '../../features/objectives/objectives.store';
import { FakeEventSource } from '../../testing/fake-event-source';
import { emptyNotifications, providePlanoTesting, settle } from '../../testing/plano-testing';
import { AuthUser } from '../auth/auth.models';
import { AuthService } from '../auth/auth.service';
import { NotificationsStore, notificationLink, notificationNewsIds, readNotificationsWhileOpen } from './notifications.store';

const user: AuthUser = {
  id: 'user-1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  username: 'ada',
  email: 'ada@example.com',
  locale: 'fr',
  avatarVersion: null,
  termsAccepted: true,
};

describe('NotificationsStore', () => {
  let store: NotificationsStore;
  let http: HttpTestingController;
  let auth: AuthService;

  const response = (items: NotificationEntry[], unread: Partial<NotificationsResponse['unread']> = {}): NotificationsResponse => ({
    items,
    unread: { ...emptyNotifications().unread, ...unread },
  });
  async function signIn(answer = emptyNotifications()): Promise<FakeEventSource> {
    auth.restoreSession().subscribe();
    http.expectOne('/api/v1/auth/session').flush(user);
    TestBed.tick();
    http.expectOne('/api/v1/notifications').flush(answer);
    await settle();
    return FakeEventSource.latest() as FakeEventSource;
  }

  beforeEach(() => {
    FakeEventSource.created = [];
    TestBed.configureTestingModule({ providers: providePlanoTesting() });
    store = TestBed.inject(NotificationsStore);
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => http.verify());

  describe('loading', () => {
    it('asks nothing while signed out, then loads at sign-in', async () => {
      TestBed.tick();
      http.expectNone('/api/v1/notifications');
      expect(store.total()).toBe(0);

      await signIn(response([notification()], { lists: 1, friends: 2 }));

      expect(store.items()).toEqual([notification()]);
      expect(store.unread()).toEqual({ friends: 2, lists: 1, objectives: 0, agenda: 0 });
      expect(store.total()).toBe(3);
    });

    it('reloads on its live event only, not on a profile change', async () => {
      const stream = await signIn();

      auth.updateUser({ ...user, locale: 'de' });
      TestBed.tick();
      stream.emit({ type: 'list.changed', listId: 'list-1' });
      http.expectNone('/api/v1/notifications');

      stream.emit({ type: 'notifications.changed' });
      http.expectOne('/api/v1/notifications').flush(response([], { objectives: 1 }));
      await settle();

      expect(store.unread().objectives).toBe(1);
    });

    it('reloads when the app comes back to the foreground, in case the stream missed something', async () => {
      await signIn();

      document.dispatchEvent(new Event('visibilitychange'));

      http.expectOne('/api/v1/notifications').flush(response([], { lists: 4 }));
      await settle();
      expect(store.unread().lists).toBe(4);
    });

    it('keeps what is shown when a reload fails, and forgets everything on sign-out', async () => {
      const stream = await signIn(response([notification()], { lists: 1 }));

      stream.emit({ type: 'notifications.changed' });
      http.expectOne('/api/v1/notifications').flush(null, { status: 500, statusText: 'Error' });
      await settle();
      expect(store.total()).toBe(1);

      auth.logout().subscribe();
      http
        .expectOne('/api/v1/auth/logout')
        .flush({ redirectTo: 'https://auth.example/oidc/session/end' });
      TestBed.tick();

      expect(store.items()).toEqual([]);
      expect(store.total()).toBe(0);
    });

    it('hides objective notifications when they are turned off on this device', async () => {
      await signIn(
        response([notification({ id: 'o', area: 'objectives', kind: 'objective.comment' }), notification()], {
          objectives: 1,
          lists: 1,
        }),
      );

      TestBed.inject(ObjectivesStore).updateSettings({ notifications: false });

      expect(store.items().map(({ id }) => id)).toEqual(['n-1']);
      expect(store.unread()).toEqual({ friends: 0, lists: 1, objectives: 0, agenda: 0 });
      expect(store.total()).toBe(1);
    });
  });

  describe('reading', () => {
    const items = [
      notification({ id: 'a', targetId: 'list-1' }),
      notification({ id: 'b', targetId: 'list-2' }),
      notification({ id: 'c', targetId: 'list-1', read: true }),
    ];

    it('marks what is about one place as read at once, then tells the API', async () => {
      await signIn(response(items, { lists: 2 }));

      const reading = store.markRead('lists', 'list-1');

      expect(store.items().map(({ id, read }) => [id, read])).toEqual([
        ['a', true],
        ['b', false],
        ['c', true],
      ]);
      expect(store.unread().lists).toBe(1);
      const request = http.expectOne({ method: 'POST', url: '/api/v1/notifications/read' });
      expect(request.request.body).toEqual({ area: 'lists', targetId: 'list-1' });
      request.flush(null);
      await reading;
      expect(store.hasUnread('lists', 'list-1')).toBe(false);
      expect(store.hasUnread('lists', 'list-2')).toBe(true);
    });

    it('marks a whole area, and asks nothing when there is nothing to read', async () => {
      await signIn(response(items, { lists: 2 }));

      void store.markRead('lists');
      const request = http.expectOne({ method: 'POST', url: '/api/v1/notifications/read' });
      expect(request.request.body).toEqual({ area: 'lists' });
      request.flush(null);
      expect(store.unread().lists).toBe(0);

      await store.markRead('lists');
      await store.markRead('objectives');
      await store.markRead('lists', 'list-9');
      http.expectNone('/api/v1/notifications/read');
    });

    it('reloads the truth when saving the read state fails', async () => {
      await signIn(response(items, { lists: 2 }));

      const reading = store.markRead('lists', 'list-2');
      http.expectOne('/api/v1/notifications/read').flush(null, { status: 500, statusText: 'Error' });
      await settle();
      http.expectOne('/api/v1/notifications').flush(response(items, { lists: 2 }));
      await reading;

      expect(store.unread().lists).toBe(2);
    });

    describe('all that the bell showed', () => {
      const shown = [
        notification({ id: 'new', targetId: 'list-2', updatedAt: '2026-10-15T09:00:00.000Z' }),
        notification({ id: 'o', area: 'objectives', kind: 'objective.comment', targetId: 'obj-1' }),
        notification({ id: 'f', area: 'friends', kind: 'friend.requested', targetId: 'user-2', updatedAt: '2026-10-14T08:00:00.000Z' }),
        notification({ id: 'old', read: true }),
      ];

      it('reads them at once, up to the newest shown, then tells the API', async () => {
        // 60 unread lists: more than the bell shows, all of them read.
        await signIn(response(shown, { lists: 60, objectives: 1, friends: 1 }));

        const reading = store.markAllRead();

        expect(store.items().every(({ read }) => read)).toBe(true);
        expect(store.total()).toBe(0);
        const request = http.expectOne({ method: 'POST', url: '/api/v1/notifications/read-all' });
        expect(request.request.body).toEqual({
          areas: ['friends', 'lists', 'objectives', 'agenda'],
          until: '2026-10-15T09:00:00.000Z',
        });
        request.flush(null);
        await reading;
        expect(store.total()).toBe(0);
      });

      it('leaves the areas turned off alone', async () => {
        await signIn(response(shown, { lists: 1, objectives: 1, friends: 1 }));
        TestBed.inject(ObjectivesStore).updateSettings({ notifications: false });

        void store.markAllRead();

        const request = http.expectOne('/api/v1/notifications/read-all');
        expect(request.request.body).toEqual({ areas: ['friends', 'lists', 'agenda'], until: '2026-10-15T09:00:00.000Z' });
        request.flush(null);
        TestBed.inject(ObjectivesStore).updateSettings({ notifications: true });
        expect(store.unread()).toEqual({ friends: 0, lists: 0, objectives: 1, agenda: 0 });
        expect(store.hasUnread('objectives', 'obj-1')).toBe(true);
      });

      it('asks nothing when everything is read already', async () => {
        await signIn(response([notification({ read: true })]));

        await store.markAllRead();

        http.expectNone('/api/v1/notifications/read-all');
        expect(store.items()[0].read).toBe(true);
      });

      it('reloads the truth when saving fails', async () => {
        await signIn(response(shown, { lists: 1, objectives: 1, friends: 1 }));

        const reading = store.markAllRead();
        http.expectOne('/api/v1/notifications/read-all').flush(null, { status: 500, statusText: 'Error' });
        await settle();
        http.expectOne('/api/v1/notifications').flush(response(shown, { lists: 1, objectives: 1, friends: 1 }));
        await reading;

        expect(store.total()).toBe(3);
        expect(store.items()[0].read).toBe(false);
      });
    });

    it('opens one from the bell: read, then off to where it happened', async () => {
      await signIn(response([notification({ id: 'f', area: 'friends', kind: 'friend.requested', targetId: 'user-2' })], { friends: 1 }));
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

      await store.open(store.items()[0]);

      http.expectOne({ method: 'POST', url: '/api/v1/notifications/f/read' }).flush(null);
      expect(store.unread().friends).toBe(0);
      expect(store.items()[0].read).toBe(true);
      expect(navigate).toHaveBeenCalledExactlyOnceWith(['/social']);

      // Already read: no request, just the way there.
      await store.open(store.items()[0]);
      http.expectNone('/api/v1/notifications/f/read');
      expect(navigate).toHaveBeenCalledTimes(2);
    });
  });

  it('leads each area to its place', () => {
    expect(notificationLink(notification({ area: 'lists', targetId: 'l' }))).toEqual({ commands: ['/lists', 'l'] });
    expect(notificationLink(notification({ area: 'objectives', targetId: 'o' }))).toEqual({ commands: ['/objectives', 'o'] });
    // Friend news are read in the Social tab.
    expect(notificationLink(notification({ area: 'friends', targetId: 'u' }))).toEqual({ commands: ['/social'] });
    expect(notificationLink(notification({ area: 'agenda', targetId: 'e' }))).toEqual({ commands: ['/agenda/events', 'e'] });
  });

  it('points at the item inside the place: what was added, the person, the guest who answered', () => {
    expect(notificationNewsIds(notification({ kind: 'list.entries', itemIds: ['e-1', 'e-2'] }))).toEqual(['e-1', 'e-2']);
    expect(notificationNewsIds(notification({ area: 'objectives', kind: 'objective.comment', itemIds: ['c-1'] }))).toEqual(['c-1']);
    expect(notificationNewsIds(notification({ area: 'friends', kind: 'friend.requested', targetId: 'user-2', itemIds: [] }))).toEqual(['user-2']);
    expect(notificationNewsIds(notification({ area: 'friends', kind: 'friend.accepted', targetId: 'user-2', itemIds: [] }))).toEqual(['user-2']);
    expect(notificationNewsIds(notification({ area: 'agenda', kind: 'agenda.declined', targetId: 'event-1', itemIds: [] }))).toEqual(['user-2']);
    // A deleted guest cannot be pointed at.
    expect(notificationNewsIds(notification({ area: 'agenda', kind: 'agenda.accepted', actor: null, itemIds: [] }))).toEqual([]);
    // The invitation is about the event itself, which the screens mark as a whole.
    expect(notificationNewsIds(notification({ area: 'agenda', kind: 'agenda.invited', itemIds: [] }))).toEqual([]);
  });

  it('names the places with unread news, so lists of them can mark each', async () => {
    await signIn(
      response(
        [
          notification({ id: 'a', targetId: 'list-1' }),
          notification({ id: 'b', targetId: 'list-2', read: true }),
          notification({ id: 'c', area: 'agenda', kind: 'agenda.invited', targetId: 'event-1' }),
        ],
        { lists: 1, agenda: 1 },
      ),
    );

    expect([...store.unreadTargets()]).toEqual(['list-1', 'event-1']);

    void store.markRead('lists', 'list-1');
    expect([...store.unreadTargets()]).toEqual(['event-1']);
    http.expectOne('/api/v1/notifications/read').flush(null);
  });

  describe('while a screen is open', () => {
    @Component({ template: '' })
    class ListScreen {
      readonly listId = signal('');
      readonly news: Signal<ReadonlySet<string>>;
      constructor() {
        this.news = readNotificationsWhileOpen('lists', this.listId);
      }
    }

    it('keeps pointing at what was new after reading it, adds what arrives, and starts over on another place', async () => {
      const stream = await signIn(
        response(
          [
            notification({ id: 'a', targetId: 'list-1', itemIds: ['e-1', 'e-2'] }),
            notification({ id: 'b', targetId: 'list-2', itemIds: ['e-9'] }),
          ],
          { lists: 2 },
        ),
      );
      const screen = TestBed.createComponent(ListScreen);
      const news = () => [...screen.componentInstance.news()];
      screen.detectChanges();
      expect(news()).toEqual([]);

      screen.componentInstance.listId.set('list-1');
      screen.detectChanges();
      http.expectOne('/api/v1/notifications/read').flush(null);
      await settle();
      screen.detectChanges();
      // Read on the server and in the counts, still marked on the screen.
      expect(store.hasUnread('lists', 'list-1')).toBe(false);
      expect(news()).toEqual(['e-1', 'e-2']);

      stream.emit({ type: 'notifications.changed' });
      http.expectOne('/api/v1/notifications').flush(
        response(
          [
            notification({ id: 'c', targetId: 'list-1', itemIds: ['e-3'] }),
            notification({ id: 'a', targetId: 'list-1', itemIds: ['e-1', 'e-2'], read: true }),
            notification({ id: 'b', targetId: 'list-2', itemIds: ['e-9'] }),
          ],
          { lists: 2 },
        ),
      );
      await settle();
      screen.detectChanges();
      http.expectOne('/api/v1/notifications/read').flush(null);
      expect(news()).toEqual(['e-1', 'e-2', 'e-3']);

      // Another list of the same screen: only its own news, none of the previous one.
      screen.componentInstance.listId.set('list-2');
      screen.detectChanges();
      expect(http.expectOne('/api/v1/notifications/read').request.body).toEqual({ area: 'lists', targetId: 'list-2' });
      expect(news()).toEqual(['e-9']);
    });

    it('points at nothing when nothing was unread there, and reads nothing', async () => {
      await signIn(response([notification({ id: 'a', targetId: 'list-1', read: true })]));
      const screen = TestBed.createComponent(ListScreen);
      screen.componentInstance.listId.set('list-1');
      screen.detectChanges();

      expect([...screen.componentInstance.news()]).toEqual([]);
      http.expectNone('/api/v1/notifications/read');
    });

    it('reads what is about its place, and what arrives meanwhile, never another place', async () => {
      const stream = await signIn(response([notification({ id: 'a', targetId: 'list-1' })], { lists: 1 }));
      const screen = TestBed.createComponent(ListScreen);
      screen.detectChanges();
      // No place yet (still loading): nothing read.
      http.expectNone('/api/v1/notifications/read');

      screen.componentInstance.listId.set('list-2');
      screen.detectChanges();
      http.expectNone('/api/v1/notifications/read');

      screen.componentInstance.listId.set('list-1');
      screen.detectChanges();
      expect(http.expectOne('/api/v1/notifications/read').request.body).toEqual({ area: 'lists', targetId: 'list-1' });

      stream.emit({ type: 'notifications.changed' });
      http.expectOne('/api/v1/notifications').flush(response([notification({ id: 'b', targetId: 'list-1' })], { lists: 1 }));
      await settle();
      screen.detectChanges();
      expect(http.expectOne('/api/v1/notifications/read').request.body).toEqual({ area: 'lists', targetId: 'list-1' });

      screen.destroy();
      stream.emit({ type: 'notifications.changed' });
      http.expectOne('/api/v1/notifications').flush(response([notification({ id: 'c', targetId: 'list-1' })], { lists: 1 }));
      await settle();
      http.expectNone('/api/v1/notifications/read');
      expect(store.hasUnread('lists', 'list-1')).toBe(true);
    });
  });
});
