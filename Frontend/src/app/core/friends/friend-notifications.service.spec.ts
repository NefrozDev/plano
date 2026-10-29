import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { FriendRequests, PublicUser } from '@plano/common';
import { AuthUser } from '../auth/auth.models';
import { AuthService } from '../auth/auth.service';
import { FakeEventSource } from '../../testing/fake-event-source';
import { providePlanoTesting, settle } from '../../testing/plano-testing';
import { FriendNotificationsService } from './friend-notifications.service';

describe('FriendNotificationsService', () => {
  let notifications: FriendNotificationsService;
  let auth: AuthService;
  let http: HttpTestingController;
  let changes: number;
  const user: AuthUser = {
    id: 'user-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    username: 'ada',
    email: 'ada@example.com',
    locale: 'fr',
    avatarVersion: null,
  };
  const bob: PublicUser = { id: 'user-2', username: 'bob', firstName: 'Bob', lastName: 'Martin', avatarVersion: null };
  const requests = (incoming: number): FriendRequests => ({
    incoming: Array.from({ length: incoming }, (_, index) => ({
      id: `request-${index}`,
      user: { ...bob, id: `user-${index + 10}` },
      createdAt: '2026-10-15T08:00:00.000Z',
    })),
    outgoing: [],
  });

  /** Signs in and answers the first count of waiting requests. */
  async function signIn(incoming = 0): Promise<FakeEventSource> {
    auth.login({ username: 'ada', password: 'secret' }).subscribe();
    http.expectOne('/api/v1/auth/login').flush(user);
    TestBed.tick();
    http.expectOne('/api/v1/friends/requests').flush(requests(incoming));
    await settle();
    return FakeEventSource.latest() as FakeEventSource;
  }

  beforeEach(() => {
    FakeEventSource.created = [];
    TestBed.configureTestingModule({ providers: providePlanoTesting() });
    notifications = TestBed.inject(FriendNotificationsService);
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    changes = 0;
    notifications.changes.subscribe(() => (changes += 1));
  });

  afterEach(() => http.verify());

  it('asks nothing while signed out, then counts the requests waiting at sign-in', async () => {
    TestBed.tick();
    http.expectNone('/api/v1/friends/requests');
    expect(notifications.count()).toBe(0);

    await signIn(2);

    expect(notifications.incoming()).toBe(2);
    expect(notifications.count()).toBe(2);
    // A profile change is not a new sign-in: no new request.
    auth.updateUser({ ...user, locale: 'de' });
    TestBed.tick();
    http.expectNone('/api/v1/friends/requests');
  });

  it('announces a new request and recounts the waiting ones', async () => {
    const stream = await signIn();

    stream.emit({ type: 'friend.requested', user: bob });
    http.expectOne('/api/v1/friends/requests').flush(requests(1));
    await settle();

    expect(notifications.message()).toBe('Bob Martin vous a envoyé une demande d’ami.');
    expect(notifications.count()).toBe(1);
    expect(changes).toBe(1);
    notifications.dismiss();
    expect(notifications.message()).toBe('');
  });

  it('announces an acceptance once per person, until the friends list is seen', async () => {
    const stream = await signIn();

    stream.emit({ type: 'friend.accepted', user: { ...bob, firstName: '', lastName: '' } });
    http.expectOne('/api/v1/friends/requests').flush(requests(0));
    stream.emit({ type: 'friend.accepted', user: bob });
    http.expectOne('/api/v1/friends/requests').flush(requests(0));
    await settle();

    // Without a name, the username says who it was.
    expect(notifications.message()).toBe('Bob Martin a accepté votre demande d’ami.');
    expect(notifications.accepted()).toEqual([bob]);
    expect(notifications.count()).toBe(1);
    expect(changes).toBe(2);

    notifications.markSeen();
    expect(notifications.count()).toBe(0);
  });

  it('only recounts on other friend changes, and ignores list events', async () => {
    const stream = await signIn(1);

    stream.emit({ type: 'friends.changed' });
    http.expectOne('/api/v1/friends/requests').flush(requests(0));
    await settle();
    stream.emit({ type: 'list.changed', listId: 'list-1' });

    http.expectNone('/api/v1/friends/requests');
    expect(notifications.message()).toBe('');
    expect(notifications.count()).toBe(0);
    expect(changes).toBe(1);
  });

  it('keeps the last count when recounting fails', async () => {
    await signIn(3);

    const refreshing = notifications.refresh();
    http.expectOne('/api/v1/friends/requests').flush(null, { status: 500, statusText: 'Error' });
    await refreshing;

    expect(notifications.count()).toBe(3);
  });

  it('forgets everything on sign-out', async () => {
    const stream = await signIn(1);
    stream.emit({ type: 'friend.accepted', user: bob });
    http.expectOne('/api/v1/friends/requests').flush(requests(1));
    await settle();

    auth.logout().subscribe();
    http.expectOne('/api/v1/auth/logout').flush(null);
    TestBed.tick();

    expect(notifications.count()).toBe(0);
    expect(notifications.message()).toBe('');
  });
});
