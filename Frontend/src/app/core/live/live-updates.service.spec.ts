import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { LiveEvent } from '@plano/common';
import { AuthUser } from '../auth/auth.models';
import { AuthService } from '../auth/auth.service';
import { FakeEventSource } from '../../testing/fake-event-source';
import { providePlanoTesting } from '../../testing/plano-testing';
import { LiveUpdatesService } from './live-updates.service';

describe('LiveUpdatesService', () => {
  let live: LiveUpdatesService;
  let auth: AuthService;
  let http: HttpTestingController;
  let received: LiveEvent[];
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

  function signIn(): void {
    auth.restoreSession().subscribe();
    http.expectOne('/api/v1/auth/session').flush(user);
    TestBed.tick();
  }

  beforeEach(() => {
    FakeEventSource.created = [];
    TestBed.configureTestingModule({ providers: providePlanoTesting() });
    live = TestBed.inject(LiveUpdatesService);
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    received = [];
    live.events.subscribe((event) => received.push(event));
  });

  afterEach(() => http.verify());

  it('opens no stream while signed out', () => {
    TestBed.tick();

    expect(FakeEventSource.created).toEqual([]);
  });

  it('opens one stream once signed in, and forwards its named events', () => {
    signIn();
    // A profile update keeps the same stream.
    auth.updateUser({ ...user, locale: 'de' });
    TestBed.tick();

    expect(FakeEventSource.created.map(({ url }) => url)).toEqual(['/api/v1/live/stream']);
    const source = FakeEventSource.latest() as FakeEventSource;
    source.emit({ type: 'list.changed', listId: 'list-1' });
    source.emit({ type: 'list.removed', listId: 'list-2' });
    source.emit({ type: 'friends.changed' });
    // The heartbeat and malformed events are dropped.
    source.dispatchEvent(new MessageEvent('ping', { data: '' }));
    source.dispatchEvent(new MessageEvent('list.changed', { data: '{oops' }));

    expect(received).toEqual([
      { type: 'list.changed', listId: 'list-1' },
      { type: 'list.removed', listId: 'list-2' },
      { type: 'friends.changed' },
    ]);
  });

  // Signing out then leaves for the identity service: the next sign-in is a new page load.
  it('closes the stream on sign-out', () => {
    signIn();
    const first = FakeEventSource.latest() as FakeEventSource;

    auth.logout().subscribe();
    http.expectOne('/api/v1/auth/logout').flush({ redirectTo: 'https://auth.example/oidc/session/end' });
    TestBed.tick();

    expect(first.closed).toBe(true);
    expect(FakeEventSource.created).toHaveLength(1);
  });

  it('closes the stream when the app is torn down', () => {
    signIn();
    const source = FakeEventSource.latest() as FakeEventSource;

    TestBed.resetTestingModule();

    expect(source.closed).toBe(true);
  });
});
