import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { providePlanoTesting, settle } from '../../testing/plano-testing';
import { ListsComponent } from './lists.component';
import { ListsStore } from './lists.store';
import { listDetail, listSettings, listSummary } from './testing/lists-fixtures';

describe('ListsComponent', () => {
  let fixture: ComponentFixture<ListsComponent>;
  let component: ListsComponent;
  let element: HTMLElement;
  let http: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [ListsComponent], providers: providePlanoTesting() });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ListsComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;

    http.expectOne('/api/v1/lists').flush([
      listSummary({ id: 'courses', name: 'Courses', memberCount: 2 }),
      listSummary({ id: 'maison', name: 'Maison', memberCount: 1 }),
      listSummary({ id: 'cadeaux', name: 'Cadeaux', ownership: 'shared', role: 'viewer' }),
      listSummary({ id: 'ete', name: 'Été', archived: true }),
    ]);
    http.expectOne('/api/v1/settings/lists').flush(listSettings());
    await settle();
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('renders the lists from the API with sharing captions and the shared navigation', () => {
    expect(element.querySelector('h1')?.textContent).toBe('Listes');
    const captions = Array.from(element.querySelectorAll('.list-copy small')).map((caption) => caption.textContent);
    expect(captions).toEqual(['Partagée avec 1 personne', 'Privée', 'Partagée avec vous']);
    expect(element.querySelector('.list-progress b')?.textContent).toBe('2 / 6');
    expect(element.querySelector('app-bottom-nav a.active')?.getAttribute('href')).toBe('/lists');
    // No notification feed exists yet: the bell must not claim an unread one.
    expect(element.querySelector('[aria-label="Notifications"] i')).toBeNull();
  });

  it('filters personal, shared and archived lists', () => {
    const names = () => component.cards().map(({ list }) => list.name);

    component.selectFilter('mine');
    expect(names()).toEqual(['Courses', 'Maison']);
    component.selectFilter('shared');
    expect(names()).toEqual(['Cadeaux']);
    component.selectFilter('archived');
    expect(names()).toEqual(['Été']);
  });

  it('searches the lists of the active category by name, ignoring case and accents', () => {
    const names = () => Array.from(element.querySelectorAll('.list-copy strong')).map((name) => name.textContent);
    const search = element.querySelector('.search-button') as HTMLButtonElement;
    expect(element.querySelector('.lists-search')).toBeNull();

    search.click();
    fixture.detectChanges();
    const input = element.querySelector('.lists-search input') as HTMLInputElement;
    expect(search.getAttribute('aria-expanded')).toBe('true');
    input.value = 'COU';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(names()).toEqual(['Courses']);

    component.selectFilter('archived');
    input.value = 'ete';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(names()).toEqual(['Été']);

    input.value = 'zzz';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(names()).toEqual([]);
    expect(element.querySelector('.empty-state')?.textContent).toContain('Aucune liste ne correspond à « zzz »');

    // Escape closes the search and forgets the query.
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(element.querySelector('.lists-search')).toBeNull();
    expect(component.query()).toBe('');
    expect(names()).toEqual(['Été']);
  });

  it('shows nothing, not even a message, for an empty category', async () => {
    // Reload without the archived list.
    void TestBed.inject(ListsStore).loadLists();
    http.expectOne('/api/v1/lists').flush([listSummary({ id: 'courses', name: 'Courses' })]);
    await settle();
    component.selectFilter('archived');
    fixture.detectChanges();

    expect(element.querySelectorAll('.list-card')).toHaveLength(0);
    expect(element.querySelector('.empty-state')).toBeNull();
    expect(element.querySelector('.new-list-button')).not.toBeNull();
  });

  it('shows a lone overview action as its own button instead of a menu', () => {
    expect(element.querySelector('.more-button')).toBeNull();
    const settings = element.querySelector('.action-button') as HTMLButtonElement;
    expect(settings.getAttribute('aria-label')).toBe('Paramètres');

    settings.click();
    fixture.detectChanges();

    expect(element.querySelector('.settings-panel')).not.toBeNull();
    expect(component.menuOpen()).toBe(false);
  });

  it('gathers several overview actions behind the more-options menu', async () => {
    // A fresh page, given a second action before its first render.
    fixture = TestBed.createComponent(ListsComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    (component as unknown as { actions: unknown[] }).actions = [
      { id: 'settings', label: 'Paramètres' },
      { id: 'other', label: 'Autre' },
    ];
    http.expectOne('/api/v1/lists').flush([listSummary({ id: 'courses', name: 'Courses' })]);
    await settle();
    fixture.detectChanges();
    expect(element.querySelector('.action-button')).toBeNull();

    const more = element.querySelector('.more-button') as HTMLButtonElement;
    more.click();
    fixture.detectChanges();
    expect(more.getAttribute('aria-expanded')).toBe('true');
    const items = Array.from(element.querySelectorAll<HTMLButtonElement>('.overview-menu button'));
    expect(items.map((item) => item.textContent?.trim())).toEqual(['Paramètres', 'Autre']);

    items[0].click();
    fixture.detectChanges();
    expect(element.querySelector('.overview-menu')).toBeNull();
    expect(element.querySelector('.settings-panel')).not.toBeNull();
  });

  it('switches to the grid layout and saves it as the default view', () => {
    (element.querySelector('.menu-button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(element.querySelector('.lists-content')?.classList).toContain('grid-view');
    const request = http.expectOne('/api/v1/settings/lists');
    expect(request.request.body).toEqual({ defaultView: 'grid' });
    request.flush(listSettings({ defaultView: 'grid' }));
  });

  it('opens the settings and applies overview preferences', () => {
    component.openSettings();
    component.toggleSetting('showCounts');
    http.expectOne('/api/v1/settings/lists').flush(listSettings({ showCounts: false }));
    fixture.detectChanges();

    expect(element.querySelector('.settings-panel')).not.toBeNull();
    expect(element.querySelector('.list-progress b')).toBeNull();
  });

  it('creates a list and opens it in its editor', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    (element.querySelector('.new-list-button') as HTMLButtonElement).click();
    const request = http.expectOne({ method: 'POST', url: '/api/v1/lists' });
    expect(request.request.body).toEqual({ name: 'Nouvelle liste', icon: 'cart', color: '#2ecb70' });
    request.flush(listDetail({ id: 'new-list' }));
    await settle();

    expect(navigate).toHaveBeenCalledWith(['/lists', 'new-list'], { queryParams: { edit: 1 } });
  });

  it('shows API failures in an error toast', async () => {
    component.toggleSetting('confirmDelete');
    http.expectOne('/api/v1/settings/lists').flush(null, { status: 500, statusText: 'Error' });
    await settle();
    fixture.detectChanges();

    expect(element.querySelector('app-toast')?.textContent).toContain('échoué');
  });
});
