import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { NotificationsStore } from '../../core/notifications/notifications.store';
import { emptyNotifications, providePlanoTesting, settle } from '../../testing/plano-testing';
import { SocialComponent } from './social.component';

describe('SocialComponent', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;

  const element = (): HTMLElement => harness.routeNativeElement as HTMLElement;
  const tabs = () => Array.from(element().querySelectorAll<HTMLAnchorElement>('.social-tabs a'));
  const current = () => element().querySelector('.social-tabs a[aria-current="page"]')?.textContent?.trim();

  /** Answers what the open section asks the API for, and says which requests those were. */
  function answer(): string[] {
    const asked = http.match((request) => /\/api\/v1\/(friends|groups)/.test(request.url));
    for (const request of asked) {
      request.flush(request.request.url.endsWith('/requests') ? { incoming: [], outgoing: [] } : []);
    }
    return asked.map((request) => request.request.url).sort();
  }

  async function open(url: string): Promise<string[]> {
    await harness.navigateByUrl(url);
    harness.detectChanges();
    const asked = answer();
    await settle();
    harness.detectChanges();
    return asked;
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: providePlanoTesting([{ path: 'social', component: SocialComponent }]),
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => http.verify());

  it('opens on the friends, as the fifth main tab', async () => {
    const asked = await open('/social');

    expect(element().querySelector('h1')?.textContent).toBe('Social');
    expect(tabs().map((tab) => [tab.textContent?.trim(), tab.getAttribute('href')])).toEqual([
      ['Amis', '/social'],
      ['Groupes', '/social?tab=groups'],
    ]);
    expect(current()).toBe('Amis');
    expect(element().querySelector('app-friends-panel #friends-heading')).not.toBeNull();
    // Only the open section loads.
    expect(element().querySelector('app-social-groups')).toBeNull();
    expect(asked).toEqual(['/api/v1/friends', '/api/v1/friends/requests']);
    const nav = element().querySelector('app-bottom-nav a[aria-current="page"]');
    expect(nav?.getAttribute('href')).toBe('/social');
  });

  it('opens on the groups when the address asks for them, without loading the friends', async () => {
    const asked = await open('/social?tab=groups');

    expect(current()).toBe('Groupes');
    expect(element().querySelector('app-social-groups #social-groups-heading')).not.toBeNull();
    expect(element().querySelector('app-friends-panel')).toBeNull();
    expect(asked).toEqual(['/api/v1/groups']);
  });

  it('falls back to the friends for an unknown section', async () => {
    await open('/social?tab=enemies');

    expect(current()).toBe('Amis');
    expect(element().querySelector('app-friends-panel')).not.toBeNull();
  });

  it('switches section from its tabs, keeping the choice in the address', async () => {
    await open('/social');

    tabs()[1].click();
    await settle();
    harness.detectChanges();
    expect(answer()).toEqual(['/api/v1/groups']);
    harness.detectChanges();

    expect(TestBed.inject(Router).url).toBe('/social?tab=groups');
    expect(current()).toBe('Groupes');
    expect(element().querySelector('app-friends-panel')).toBeNull();

    tabs()[0].click();
    await settle();
    harness.detectChanges();
    answer();

    expect(TestBed.inject(Router).url).toBe('/social');
    expect(element().querySelector('app-social-groups')).toBeNull();
  });

  it('counts unread friend news on the friends tab while the groups are open', async () => {
    await open('/social?tab=groups');
    expect(tabs()[0].querySelector('.badge')).toBeNull();
    expect(tabs()[0].getAttribute('aria-label')).toBeNull();

    const loading = TestBed.inject(NotificationsStore).load();
    http
      .expectOne('/api/v1/notifications')
      .flush({ items: [], unread: { ...emptyNotifications().unread, friends: 2, lists: 5 } });
    await loading;
    harness.detectChanges();

    expect(tabs()[0].querySelector('.badge')?.textContent).toBe('2');
    expect(tabs()[0].getAttribute('aria-label')).toBe('Amis, 2 nouveauté(s)');
    expect(tabs()[1].querySelector('.badge')).toBeNull();
    // Nothing is read until the friends are shown.
    http.expectNone('/api/v1/notifications/read');
  });
});
