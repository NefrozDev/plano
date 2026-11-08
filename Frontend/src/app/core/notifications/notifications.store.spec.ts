import { HttpTestingController } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { NotificationEntry, NotificationsResponse } from '@plano/common';
import { notification } from '../../testing/notifications-fixtures';
import { ObjectivesStore } from '../../features/objectives/objectives.store';
import { FakeEventSource } from '../../testing/fake-event-source';
import { emptyNotifications, providePlanoTesting, settle } from '../../testing/plano-testing';
import { AuthUser } from '../auth/auth.models';
import { AuthService } from '../auth/auth.service';
import { NotificationsStore, notificationLink, readNotificationsWhileOpen } from './notifications.store';

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
      http.expectOne('/api/v1/auth/logout').flush(null);
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

    it('opens one from the bell: read, then off to where it happened', async () => {
      await signIn(response([notification({ id: 'f', area: 'friends', kind: 'friend.requested', targetId: 'user-2' })], { friends: 1 }));
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

      await store.open(store.items()[0]);

      http.expectOne({ method: 'POST', url: '/api/v1/notifications/f/read' }).flush(null);
      expect(store.unread().friends).toBe(0);
      expect(store.items()[0].read).toBe(true);
      expect(navigate).toHaveBeenCalledExactlyOnceWith(['/settings'], { fragment: 'friends' });

      // Already read: no request, just the way there.
      await store.open(store.items()[0]);
      http.expectNone('/api/v1/notifications/f/read');
      expect(navigate).toHaveBeenCalledTimes(2);
    });
  });

  it('leads each area to its place', () => {
    expect(notificationLink(notification({ area: 'lists', targetId: 'l' }))).toEqual({ commands: ['/lists', 'l'] });
    expect(notificationLink(notification({ area: 'objectives', targetId: 'o' }))).toEqual({ commands: ['/objectives', 'o'] });
    expect(notificationLink(notification({ area: 'friends', targetId: 'u' }))).toEqual({
      commands: ['/settings'],
      fragment: 'friends',
    });
    expect(notificationLink(notification({ area: 'agenda', targetId: 'e' }))).toEqual({ commands: ['/agenda/events', 'e'] });
  });

  describe('while a screen is open', () => {
    @Component({ template: '' })
    class ListScreen {
      readonly listId = signal('');
      constructor() {
        readNotificationsWhileOpen('lists', this.listId);
      }
    }

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
