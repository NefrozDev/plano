import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { NotificationEntry, NotificationsResponse } from '@plano/common';
import { NotificationsStore } from '../../core/notifications/notifications.store';
import { notification } from '../../testing/notifications-fixtures';
import { TEST_TODAY, emptyNotifications, providePlanoTesting } from '../../testing/plano-testing';
import { NotificationsBellComponent } from './notifications-bell.component';

describe('NotificationsBellComponent', () => {
  let fixture: ComponentFixture<NotificationsBellComponent>;
  let element: HTMLElement;
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;

  const minutesAgo = (minutes: number) => new Date(TEST_TODAY.getTime() - minutes * 60_000).toISOString();
  const bell = () => element.querySelector('.bell') as HTMLButtonElement;
  const rows = () => Array.from(element.querySelectorAll<HTMLButtonElement>('.panel li button'));
  const messages = () => rows().map((row) => row.querySelector('.message')?.textContent?.trim());

  async function receive(items: NotificationEntry[], unread: Partial<NotificationsResponse['unread']> = {}): Promise<void> {
    const loading = TestBed.inject(NotificationsStore).load();
    http.expectOne('/api/v1/notifications').flush({ items, unread: { ...emptyNotifications().unread, ...unread } });
    await loading;
    fixture.detectChanges();
  }
  const open = () => {
    bell().click();
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [NotificationsBellComponent], providers: providePlanoTesting() });
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(NotificationsBellComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('counts every unread notification, friends included, on the bell', async () => {
    expect(bell().querySelector('.badge')).toBeNull();
    expect(bell().getAttribute('aria-label')).toBe('Notifications');

    await receive([], { friends: 1, lists: 2, objectives: 3 });

    expect(bell().querySelector('.badge')?.textContent).toBe('6');
    expect(bell().getAttribute('aria-label')).toBe('Notifications, 6 non lue(s)');
    expect(element.querySelector('.panel')).toBeNull();
  });

  it('says so when there is nothing yet', () => {
    open();

    expect(bell().getAttribute('aria-expanded')).toBe('true');
    expect(element.querySelector('.panel .empty')?.textContent).toBe('Aucune notification pour l’instant.');
  });

  it('lists them newest first, worded for each kind, with who and when', async () => {
    await receive([
      notification({ id: '1', area: 'friends', kind: 'friend.requested', targetId: 'user-2', title: '', updatedAt: minutesAgo(5) }),
      notification({ id: '2', area: 'friends', kind: 'friend.accepted', targetId: 'user-2', title: '', updatedAt: minutesAgo(150), read: true }),
      notification({ id: '3', kind: 'list.invited', updatedAt: minutesAgo(60 * 30) }),
      notification({ id: '4', kind: 'list.entries' }),
      notification({ id: '5', kind: 'list.entries', count: 3 }),
      notification({ id: '6', area: 'objectives', kind: 'objective.invited', title: 'Courir' }),
      notification({ id: '7', area: 'objectives', kind: 'objective.contribution', title: 'Courir', count: 2 }),
      notification({ id: '8', area: 'objectives', kind: 'objective.completed', title: 'Courir', actor: null }),
      notification({ id: '9', area: 'objectives', kind: 'objective.comment', title: 'Courir', actor: null }),
    ]);
    open();

    expect(messages()).toEqual([
      'Bob Martin vous a envoyé une demande d’ami.',
      'Bob Martin a accepté votre demande d’ami.',
      'Bob Martin a partagé la liste « Courses » avec vous.',
      'Bob Martin a ajouté un élément à « Courses ».',
      '3 éléments ajoutés à « Courses », le dernier par Bob Martin.',
      'Bob Martin vous a invité(e) à « Courir ».',
      '2 contributions à « Courir », la dernière de Bob Martin.',
      '« Courir » est terminé.',
      // An account since deleted.
      'Quelqu’un a commenté « Courir ».',
    ]);
    expect(rows().map((row) => row.querySelector('small')?.textContent)).toEqual(
      expect.arrayContaining(['il y a 5 minutes', 'il y a 2 heures', 'hier']),
    );
    expect(rows()[0].classList).toContain('unread');
    expect(rows()[0].querySelector('.dot')).not.toBeNull();
    expect(rows()[1].classList).not.toContain('unread');
    expect(rows()[1].querySelector('.dot')).toBeNull();
    // Faces go through the shared avatar; none for a deleted account.
    expect(rows()[0].querySelector('app-user-avatar')?.textContent?.trim()).toBe('BM');
    expect(rows()[8].querySelector('app-user-avatar')).toBeNull();
  });

  it('opens a notification where it happened, read, and closes the panel', async () => {
    await receive([notification({ id: 'n-1', targetId: 'list-1' })], { lists: 1 });
    open();

    rows()[0].click();
    fixture.detectChanges();

    http.expectOne({ method: 'POST', url: '/api/v1/notifications/n-1/read' }).flush(null);
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/lists', 'list-1'], {});
    expect(element.querySelector('.panel')).toBeNull();
    expect(bell().querySelector('.badge')).toBeNull();
  });

  it('closes on a click elsewhere or Escape, not on a click inside', () => {
    open();
    (element.querySelector('.panel') as HTMLElement).click();
    fixture.detectChanges();
    expect(element.querySelector('.panel')).not.toBeNull();

    document.body.click();
    fixture.detectChanges();
    expect(element.querySelector('.panel')).toBeNull();

    open();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(element.querySelector('.panel')).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });
});
