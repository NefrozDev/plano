import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { NotificationsResponse } from '@plano/common';
import { NotificationsStore } from '../../core/notifications/notifications.store';
import { ObjectivesStore } from '../../features/objectives/objectives.store';
import { providePlanoTesting } from '../../testing/plano-testing';
import { BottomNavComponent } from './bottom-nav.component';

describe('BottomNavComponent', () => {
  let fixture: ComponentFixture<BottomNavComponent>;
  let element: HTMLElement;

  const tab = (href: string) => element.querySelector(`a[href="${href}"]`) as HTMLAnchorElement;
  const badges = () =>
    Array.from(element.querySelectorAll('a'), (link) => [link.getAttribute('href'), link.querySelector('.badge')?.textContent ?? null]);

  /** The store as the API would fill it. */
  async function receive(unread: NotificationsResponse['unread']): Promise<void> {
    const store = TestBed.inject(NotificationsStore);
    const loading = store.load();
    TestBed.inject(HttpTestingController).expectOne('/api/v1/notifications').flush({ items: [], unread });
    await loading;
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [BottomNavComponent], providers: providePlanoTesting() });
    fixture = TestBed.createComponent(BottomNavComponent);
    fixture.componentRef.setInput('active', 'home');
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('marks the current section', () => {
    const active = element.querySelector('a.active');

    expect(active?.getAttribute('href')).toBe('/');
    expect(active?.getAttribute('aria-current')).toBe('page');
    expect(element.querySelectorAll('a[aria-current]')).toHaveLength(1);
  });

  it('shows no badge without notifications', () => {
    expect(element.querySelector('.badge')).toBeNull();
    expect(element.querySelectorAll('a[aria-label]')).toHaveLength(0);
  });

  it('counts each section’s unread notifications on its tab, and says so to screen readers', async () => {
    await receive({ friends: 4, lists: 2, objectives: 3, agenda: 1 });

    // Friend news have no tab: they are in the home page bell.
    expect(badges()).toEqual([
      ['/', null],
      ['/agenda', '1'],
      ['/lists', '2'],
      ['/objectives', '3'],
    ]);
    expect(tab('/lists').getAttribute('aria-label')).toBe('Liste, 2 nouveauté(s)');
    expect(tab('/objectives').getAttribute('aria-label')).toBe('Objectifs, 3 nouveauté(s)');
    expect(tab('/').getAttribute('aria-label')).toBeNull();
  });

  it('hides objective counts when their notifications are turned off on this device', async () => {
    TestBed.inject(ObjectivesStore).updateSettings({ notifications: false });
    await receive({ friends: 0, lists: 2, objectives: 3, agenda: 0 });

    expect(tab('/objectives').querySelector('.badge')).toBeNull();
    expect(tab('/lists').querySelector('.badge')?.textContent).toBe('2');
  });
});
