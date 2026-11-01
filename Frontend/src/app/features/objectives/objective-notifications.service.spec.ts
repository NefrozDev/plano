import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../core/auth/auth.service';
import { FakeEventSource } from '../../testing/fake-event-source';
import { providePlanoTesting } from '../../testing/plano-testing';
import { ObjectiveNotificationsService } from './objective-notifications.service';
import { ObjectivesStore } from './objectives.store';
import { ME } from './testing/objectives-fixtures';

describe('ObjectiveNotificationsService', () => {
  let notifications: ObjectiveNotificationsService;
  const user = signal<{ id: string } | null>({ id: ME });

  const hear = (kind: 'invited' | 'contribution' | 'completed'): void => {
    FakeEventSource.latest()?.emit({
      type: 'objective.news',
      objectiveId: 'obj-1',
      kind,
      title: 'Courir',
      actor: 'Bob Martin',
    });
  };

  beforeEach(() => {
    user.set({ id: ME });
    TestBed.configureTestingModule({
      providers: [...providePlanoTesting(), { provide: AuthService, useValue: { user } }],
    });
    notifications = TestBed.inject(ObjectiveNotificationsService);
    TestBed.tick();
  });

  it('starts with nothing to say', () => {
    expect(notifications.unseen()).toBe(0);
    expect(notifications.message()).toBe('');
  });

  it.each([
    ['invited', 'Bob Martin vous a invité(e) à « Courir ».'],
    ['contribution', 'Bob Martin a contribué à « Courir ».'],
    ['completed', '« Courir » est terminé.'],
  ] as const)('says when %s, and counts it', (kind, message) => {
    hear(kind);

    expect(notifications.message()).toBe(message);
    expect(notifications.unseen()).toBe(1);
  });

  it('counts each piece of news, keeping the last message', () => {
    hear('invited');
    hear('completed');

    expect(notifications.unseen()).toBe(2);
    expect(notifications.message()).toBe('« Courir » est terminé.');
  });

  it('ignores other events', () => {
    FakeEventSource.latest()?.emit({ type: 'objective.changed', objectiveId: 'obj-1' });
    FakeEventSource.latest()?.emit({ type: 'friends.changed' });

    expect(notifications.unseen()).toBe(0);
    expect(notifications.message()).toBe('');
  });

  it('stays quiet when the setting is off', () => {
    TestBed.inject(ObjectivesStore).updateSettings({ notifications: false });

    hear('invited');

    expect(notifications.unseen()).toBe(0);
    expect(notifications.message()).toBe('');
  });

  it('clears the badge and the message separately', () => {
    hear('invited');

    notifications.dismiss();
    expect(notifications.message()).toBe('');
    expect(notifications.unseen()).toBe(1);

    notifications.markSeen();
    expect(notifications.unseen()).toBe(0);
  });

  it('forgets everything when someone else signs in', () => {
    hear('invited');

    user.set(null);
    TestBed.tick();

    expect(notifications.unseen()).toBe(0);
    expect(notifications.message()).toBe('');
  });
});
