import type { MockInstance } from 'vitest';
import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Friend, FriendRequests, PublicUser, UserSearchResult } from '@plano/common';
import { FriendNotificationsService } from '../../core/friends/friend-notifications.service';
import { ConfirmService } from '../../shared/ui/confirm.service';
import { providePlanoTesting, settle } from '../../testing/plano-testing';
import { FriendsPanelComponent } from './friends-panel.component';

const person = (id: string, firstName: string): PublicUser => ({
  id,
  firstName,
  lastName: 'Test',
  username: firstName.toLowerCase(),
  avatarVersion: null,
});
const bob = person('user-bob', 'Bob');
const cyd = person('user-cyd', 'Cyd');
const dan = person('user-dan', 'Dan');
const friendOf = (user: PublicUser): Friend => ({ ...user, since: '2026-10-01T00:00:00.000Z' });

describe('FriendsPanelComponent', () => {
  let fixture: ComponentFixture<FriendsPanelComponent>;
  let component: FriendsPanelComponent;
  let element: HTMLElement;
  let http: HttpTestingController;
  let confirm: MockInstance<ConfirmService['ask']>;

  const requests: FriendRequests = {
    incoming: [{ id: 'request-cyd', user: cyd, createdAt: '2026-10-10T00:00:00.000Z' }],
    outgoing: [{ id: 'request-dan', user: dan, createdAt: '2026-10-11T00:00:00.000Z' }],
  };

  /** Answers the friends and requests reloads every load and action ends with. */
  function flushLists(friends: Friend[] = [friendOf(bob)], pending: FriendRequests = requests): void {
    http.expectOne('/api/v1/friends').flush(friends);
    http.expectOne('/api/v1/friends/requests').flush(pending);
  }

  async function render(): Promise<void> {
    await settle();
    fixture.detectChanges();
  }

  const texts = (selector: string) =>
    Array.from(element.querySelectorAll(selector)).map((node) => node.textContent?.trim().replace(/\s+/g, ' '));
  const button = (row: string, label: string) =>
    Array.from(element.querySelectorAll<HTMLElement>('.person'))
      .find((node) => node.textContent?.includes(row))
      ?.querySelector<HTMLButtonElement>(`.actions button:nth-child(${label === 'second' ? 2 : 1})`) as HTMLButtonElement;

  /** Types a query and lets the search debounce elapse. */
  async function search(query: string): Promise<void> {
    const input = element.querySelector('app-search-field input') as HTMLInputElement;
    input.value = query;
    input.dispatchEvent(new Event('input'));
    // toObservable emits from an effect, which change detection runs, as the app does after an input.
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 350));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [FriendsPanelComponent], providers: providePlanoTesting() });
    http = TestBed.inject(HttpTestingController);
    confirm = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);
    fixture = TestBed.createComponent(FriendsPanelComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    flushLists();
    await render();
  });

  afterEach(() => http.verify());

  it('lists received requests, sent requests and friends', () => {
    expect(texts('h3')).toEqual(['Demandes reçues', 'Demandes envoyées', 'Mes amis (1)']);
    expect(texts('.person .identity')).toEqual(['Cyd Test@cyd', 'Dan Test@dan', 'Bob Test@bob']);
    expect(texts('.person .actions')).toEqual(['Accepter Refuser', 'Annuler', 'Retirer']);
    expect(element.querySelector('.results')).toBeNull();
  });

  describe('friend news', () => {
    it('counts the acceptances as seen once the panel shows, and keeps the badge in step with the requests', async () => {
      const notifications = TestBed.inject(FriendNotificationsService);
      expect(notifications.incoming()).toBe(1);
      notifications.accepted.set([bob]);

      // A new panel (the settings page opened again) marks them seen.
      const again = TestBed.createComponent(FriendsPanelComponent);
      again.detectChanges();
      flushLists();
      await settle();

      expect(notifications.accepted()).toEqual([]);
      expect(notifications.count()).toBe(1);
    });

    it('reloads both lists when a friend event arrives', async () => {
      const notifications = TestBed.inject(FriendNotificationsService);
      notifications.accepted.set([bob]);
      // Signed out in this spec: emit the event the service relays.
      (notifications as unknown as { changesSubject: { next(): void } }).changesSubject.next();

      flushLists([friendOf(bob), friendOf(cyd)], { incoming: [], outgoing: [] });
      await render();

      expect(texts('.person strong')).toContain('Cyd Test');
      expect(notifications.accepted()).toEqual([]);
      expect(notifications.incoming()).toBe(0);
    });
  });

  it('accepts a received request, then reloads both lists', async () => {
    button('Cyd', 'first').click();
    await settle();
    const accept = http.expectOne('/api/v1/friends/requests/request-cyd/accept');
    expect(accept.request.method).toBe('POST');
    accept.flush(friendOf(cyd));
    await settle();
    flushLists([friendOf(bob), friendOf(cyd)], { incoming: [], outgoing: requests.outgoing });
    await render();

    expect(texts('h3')).toEqual(['Demandes envoyées', 'Mes amis (2)']);
    expect(component.busy()).toBe('');
  });

  it('declines a received request and cancels a sent one', async () => {
    button('Cyd', 'second').click();
    await settle();
    http.expectOne({ method: 'DELETE', url: '/api/v1/friends/requests/request-cyd' }).flush(null);
    await settle();
    flushLists([friendOf(bob)], { incoming: [], outgoing: requests.outgoing });
    await render();

    button('Dan', 'first').click();
    await settle();
    http.expectOne({ method: 'DELETE', url: '/api/v1/friends/requests/request-dan' }).flush(null);
    await settle();
    flushLists([friendOf(bob)], { incoming: [], outgoing: [] });
    await render();

    expect(texts('h3')).toEqual(['Mes amis (1)']);
  });

  it('removes a friend only once confirmed', async () => {
    confirm.mockResolvedValueOnce(false);
    button('Bob', 'first').click();
    await settle();
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ heading: 'Retirer cet ami ?', message: expect.stringContaining('Bob Test') as string, tone: 'danger' }),
    );
    http.expectNone('/api/v1/friends/user-bob');

    button('Bob', 'first').click();
    await settle();
    http.expectOne({ method: 'DELETE', url: '/api/v1/friends/user-bob' }).flush(null);
    await settle();
    flushLists([], requests);
    await render();

    expect(confirm).toHaveBeenCalledTimes(2);
    expect(element.querySelector('.empty')?.textContent).toContain('Pas encore d’amis');
  });

  describe('search', () => {
    const results: UserSearchResult[] = [
      { ...person('user-eve', 'Eve'), relation: 'none' },
      { ...cyd, relation: 'incoming' },
      { ...dan, relation: 'outgoing' },
      { ...bob, relation: 'friend' },
    ];

    function answer(query: string, found: UserSearchResult[]): TestRequest {
      const request = http.expectOne((candidate) => candidate.url === '/api/v1/friends/search');
      expect(request.request.params.get('q')).toBe(query);
      request.flush(found);
      return request;
    }

    it('searches from two characters, after a pause, with one action per relation', async () => {
      await search('e');
      http.expectNone((candidate) => candidate.url === '/api/v1/friends/search');

      await search(' ev ');
      answer('ev', results);
      fixture.detectChanges();

      const rows = Array.from(element.querySelectorAll('.results .person'));
      expect(rows.map((row) => row.querySelector('.actions')?.textContent?.trim())).toEqual([
        'Ajouter',
        'Accepter',
        'Demande envoyée',
        'Ami',
      ]);
    });

    it('sends a request and shows it as sent', async () => {
      await search('ev');
      answer('ev', results);
      fixture.detectChanges();

      (element.querySelector('.results .action') as HTMLButtonElement).click();
      await settle();
      const send = http.expectOne({ method: 'POST', url: '/api/v1/friends/requests' });
      expect(send.request.body).toEqual({ userId: 'user-eve' });
      send.flush({ status: 'pending' });
      await settle();
      flushLists();
      await render();

      expect(element.querySelector('.results .person .actions')?.textContent?.trim()).toBe('Demande envoyée');
    });

    it('shows someone who had already asked as a friend at once', async () => {
      await search('ev');
      answer('ev', results);
      fixture.detectChanges();

      const adding = component.add(results[0]);
      await settle();
      http.expectOne({ method: 'POST', url: '/api/v1/friends/requests' }).flush({ status: 'accepted' });
      await settle();
      flushLists();
      await adding;
      fixture.detectChanges();

      expect(element.querySelector('.results .person .actions')?.textContent?.trim()).toBe('Ami');
    });

    it('says when nobody matches, and when the search fails', async () => {
      await search('zz');
      answer('zz', []);
      fixture.detectChanges();
      expect(element.querySelector('.results .empty')?.textContent).toContain('Aucun utilisateur trouvé.');

      await search('zzz');
      http
        .expectOne((candidate) => candidate.url === '/api/v1/friends/search')
        .flush({ message: 'Trop de requêtes' }, { status: 429, statusText: 'Too Many Requests' });
      fixture.detectChanges();
      expect(element.querySelector('[role="alert"]')?.textContent).toContain('La recherche a échoué');
    });
  });

  it('reports failed loads and actions, and runs one action at a time', async () => {
    const accepting = component.accept(cyd);
    void component.decline(cyd);
    await settle();
    http
      .expectOne('/api/v1/friends/requests/request-cyd/accept')
      .flush({ message: 'Erreur' }, { status: 500, statusText: 'Server Error' });
    await accepting;
    fixture.detectChanges();

    // The decline was ignored while the accept ran.
    http.expectNone('/api/v1/friends/requests/request-cyd');
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('L’action a échoué');

    // Unknown requests are ignored without a call.
    await component.accept(bob);
    await component.cancel(bob);
    http.expectNone((candidate) => candidate.url.includes('/requests/'));
  });

  it('reports lists that cannot be loaded', async () => {
    fixture.destroy();
    fixture = TestBed.createComponent(FriendsPanelComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    http.expectOne('/api/v1/friends').flush({ message: 'Erreur' }, { status: 500, statusText: 'Server Error' });
    http.expectOne('/api/v1/friends/requests').flush({ incoming: [], outgoing: [] });
    await render();

    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Impossible de charger vos amis.');
  });
});
