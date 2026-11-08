import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { PublicUser } from '@plano/common';
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
    termsAccepted: true,
  };
  const bob: PublicUser = { id: 'user-2', username: 'bob', firstName: 'Bob', lastName: 'Martin', avatarVersion: null };
  /** Signs in: the live stream opens, and no request is made for friend news. */
  async function signIn(): Promise<FakeEventSource> {
    auth.restoreSession().subscribe();
    http.expectOne('/api/v1/auth/session').flush(user);
    TestBed.tick();
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

  it('announces a new request, and asks open friend lists to reload', async () => {
    const stream = await signIn();

    stream.emit({ type: 'friend.requested', user: bob });

    expect(notifications.message()).toBe('Bob Martin vous a envoyé une demande d’ami.');
    expect(changes).toBe(1);
    // Counting is the notifications store's job: nothing is asked here.
    http.expectNone('/api/v1/friends/requests');
    notifications.dismiss();
    expect(notifications.message()).toBe('');
  });

  it('announces an acceptance, by name or by username', async () => {
    const stream = await signIn();

    stream.emit({ type: 'friend.accepted', user: { ...bob, firstName: '', lastName: '' } });
    expect(notifications.message()).toBe('bob a accepté votre demande d’ami.');

    stream.emit({ type: 'friend.accepted', user: bob });
    expect(notifications.message()).toBe('Bob Martin a accepté votre demande d’ami.');
    expect(changes).toBe(2);
  });

  it('only signals other friend changes, and ignores list events', async () => {
    const stream = await signIn();

    stream.emit({ type: 'friends.changed' });
    stream.emit({ type: 'list.changed', listId: 'list-1' });

    expect(notifications.message()).toBe('');
    expect(changes).toBe(1);
  });

  it('clears its message on sign-out', async () => {
    const stream = await signIn();
    stream.emit({ type: 'friend.accepted', user: bob });

    auth.logout().subscribe();
    http.expectOne('/api/v1/auth/logout').flush(null);
    TestBed.tick();

    expect(notifications.message()).toBe('');
  });
});
