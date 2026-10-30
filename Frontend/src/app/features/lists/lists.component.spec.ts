import type { MockInstance } from 'vitest';
import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { providePlanoTesting, settle } from '../../testing/plano-testing';
import { FriendNotificationsService } from '../../core/friends/friend-notifications.service';
import { ListsComponent, SHARED_LIST_NOTICE } from './lists.component';
import { WHEEL_SWIPE_END_MS } from './list-detail/swipe-to-delete';
import { ListsStore } from './lists.store';
import { ConfirmService } from '../../shared/ui/confirm.service';
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
    // Nothing new: the bell leads to the friends settings without a badge.
    const bell = element.querySelector('.notifications-link') as HTMLAnchorElement;
    expect(bell.getAttribute('href')).toBe('/settings');
    expect(bell.getAttribute('aria-label')).toBe('Notifications');
    expect(bell.querySelector('.badge')).toBeNull();
  });

  it('shows friend news on the bell', () => {
    TestBed.inject(FriendNotificationsService).incoming.set(2);
    fixture.detectChanges();

    const bell = element.querySelector('.notifications-link') as HTMLAnchorElement;
    expect(bell.querySelector('.badge')?.textContent).toBe('2');
    expect(bell.getAttribute('aria-label')).toBe('Notifications : 2 nouvelle(s)');
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

  describe('reordering', () => {
    const order = () => Array.from(element.querySelectorAll<HTMLElement>('.list-item')).map((item) => item.dataset['listId']);
    const handle = (listId: string) =>
      element.querySelector(`.list-item[data-list-id="${listId}"] .drag-handle`) as HTMLButtonElement;
    const pointer = (type: string, target: Element, x = 0, y = 0) =>
      target.dispatchEvent(new PointerEvent(type, { pointerId: 1, clientX: x, clientY: y, bubbles: true, cancelable: true }));
    const centre = (listId: string) => {
      const box = (element.querySelector(`.list-item[data-list-id="${listId}"]`) as HTMLElement).getBoundingClientRect();
      return [box.left + box.width / 2, box.top + box.height / 2] as const;
    };

    beforeEach(() => {
      // Real layout: the cards must be on screen for elementFromPoint().
      document.body.append(element);
    });

    afterEach(() => element.remove());

    it('drags a list by its handle onto another card and saves the order on drop', () => {
      expect(order()).toEqual(['courses', 'maison', 'cadeaux']);
      const grip = handle('cadeaux');
      expect(grip.getAttribute('aria-label')).toBe('Déplacer la liste Cadeaux (flèches pour changer sa place)');
      grip.setPointerCapture = vi.fn();

      pointer('pointerdown', grip);
      fixture.detectChanges();
      expect(grip.setPointerCapture).toHaveBeenCalledExactlyOnceWith(1);
      expect(element.querySelector('.list-item.dragging')?.getAttribute('data-list-id')).toBe('cadeaux');
      pointer('pointermove', grip, ...centre('courses'));
      fixture.detectChanges();
      expect(order()).toEqual(['cadeaux', 'courses', 'maison']);
      http.expectNone('/api/v1/lists/order');

      pointer('pointerup', grip);
      fixture.detectChanges();

      const save = http.expectOne('/api/v1/lists/order');
      expect(save.request.body).toEqual({ listIds: ['cadeaux', 'courses', 'maison', 'ete'] });
      save.flush(null, { status: 204, statusText: 'No Content' });
      expect(element.querySelector('.list-item.dragging')).toBeNull();
    });

    it('saves nothing for a drag that moved nothing, and ignores moves without a drag', () => {
      pointer('pointermove', element, ...centre('maison'));
      const grip = handle('courses');
      grip.setPointerCapture = vi.fn();
      pointer('pointerdown', grip);
      pointer('pointermove', grip, ...centre('courses'));
      pointer('pointerup', grip);
      pointer('pointerup', grip);

      http.expectNone('/api/v1/lists/order');
      expect(order()).toEqual(['courses', 'maison', 'cadeaux']);
    });

    it('moves a list with the arrow keys of its handle, past visible neighbours only', () => {
      const key = (listId: string, name: string) => {
        const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
        handle(listId).dispatchEvent(event);
        fixture.detectChanges();
        return event.defaultPrevented;
      };

      expect(key('maison', 'ArrowDown')).toBe(true);
      expect(order()).toEqual(['courses', 'cadeaux', 'maison']);
      expect(http.expectOne('/api/v1/lists/order').request.body).toEqual({
        listIds: ['courses', 'cadeaux', 'maison', 'ete'],
      });

      // Already first, or a key that is not an arrow: nothing happens.
      expect(key('courses', 'ArrowUp')).toBe(true);
      expect(key('courses', 'Enter')).toBe(false);
      http.expectNone('/api/v1/lists/order');
      expect(order()).toEqual(['courses', 'cadeaux', 'maison']);
    });
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

  describe('opening and swiping cards', () => {
    let navigate: MockInstance<Router['navigate']>;
    let ask: MockInstance<ConfirmService['ask']>;
    const card = (listId: string) =>
      element.querySelector(`.list-item[data-list-id="${listId}"] .list-card`) as HTMLButtonElement;
    const pointer = (target: Element, type: string, clientX: number) =>
      target.dispatchEvent(new PointerEvent(type, { pointerId: 1, clientX, bubbles: true, cancelable: true }));
    const swipe = (target: Element, from: number, to: number) => {
      target.setPointerCapture = vi.fn();
      pointer(target, 'pointerdown', from);
      pointer(target, 'pointermove', (from + to) / 2);
      pointer(target, 'pointermove', to);
      fixture.detectChanges();
      pointer(target, 'pointerup', to);
      // The browser ends a swipe with a click on the card.
      (target as HTMLElement).click();
      fixture.detectChanges();
    };

    beforeEach(() => {
      navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask');
    });

    it('opens a list on a tap', () => {
      card('courses').click();

      expect(navigate).toHaveBeenCalledExactlyOnceWith(['/lists', 'courses']);
      expect(ask).not.toHaveBeenCalled();
    });

    it('asks before deleting an own list swiped left, then deletes it, without opening it', async () => {
      ask.mockResolvedValue(true);

      swipe(card('courses'), 300, 200);
      await settle();

      expect(navigate).not.toHaveBeenCalled();
      expect(ask).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ heading: 'Supprimer la liste ?', confirmLabel: 'Supprimer', tone: 'danger' }),
      );
      expect(ask.mock.lastCall![0].message).toContain('« Courses »');
      http.expectOne({ method: 'DELETE', url: '/api/v1/lists/courses' }).flush(null);
      await settle();
      fixture.detectChanges();
      expect(element.querySelector('.list-item[data-list-id="courses"]')).toBeNull();
    });

    it('keeps the list when the deletion is cancelled, or the swipe too short', async () => {
      ask.mockResolvedValue(false);

      swipe(card('courses'), 300, 200);
      await settle();
      swipe(card('maison'), 300, 280);
      await settle();

      expect(ask).toHaveBeenCalledTimes(1);
      http.expectNone({ method: 'DELETE', url: '/api/v1/lists/courses' });
      expect(card('courses')).not.toBeNull();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('does not slide lists shared with the user, who cannot delete them', () => {
      expect(element.querySelector('.list-item[data-list-id="cadeaux"] .delete-list')).toBeNull();

      swipe(card('cadeaux'), 300, 150);

      expect(ask).not.toHaveBeenCalled();
      expect(card('cadeaux').style.transform).toBe('');
      // A tap still opens it.
      card('cadeaux').click();
      expect(navigate).toHaveBeenCalledExactlyOnceWith(['/lists', 'cadeaux']);
    });

    it('follows a two-finger touchpad swipe, keeping it from the browser, and asks once it ends', async () => {
      ask.mockResolvedValue(false);
      const wheel = (deltaX: number, deltaY = 0) => {
        const event = new WheelEvent('wheel', { deltaX, deltaY, bubbles: true, cancelable: true });
        card('courses').dispatchEvent(event);
        fixture.detectChanges();
        return event.defaultPrevented;
      };

      // Vertical scrolling stays the page's.
      expect(wheel(2, 40)).toBe(false);
      expect(wheel(12)).toBe(true);
      expect(wheel(12)).toBe(true);
      expect(wheel(12)).toBe(true);
      expect(card('courses').style.transform).toBe('translateX(-36px)');
      expect(ask).not.toHaveBeenCalled();

      await new Promise((resolve) => setTimeout(resolve, WHEEL_SWIPE_END_MS + 50));
      fixture.detectChanges();

      expect(ask).toHaveBeenCalledTimes(1);
      expect(card('courses').style.transform).toBe('');
      // No click follows a touchpad swipe: the next tap opens the list.
      card('courses').click();
      expect(navigate).toHaveBeenCalledExactlyOnceWith(['/lists', 'courses']);
    });

    it('explains, without sliding, that only the owner deletes a list shared with the user', async () => {
      const event = new WheelEvent('wheel', { deltaX: 80, bubbles: true, cancelable: true });

      card('cadeaux').dispatchEvent(event);
      fixture.detectChanges();
      expect(card('cadeaux').style.transform).toBe('');
      await new Promise((resolve) => setTimeout(resolve, WHEEL_SWIPE_END_MS + 50));
      fixture.detectChanges();

      expect(ask).not.toHaveBeenCalled();
      expect(component.notice()).toBe(SHARED_LIST_NOTICE);
      expect(element.textContent).toContain('Seule la personne qui a créé cette liste peut la supprimer.');
      // With a finger or the mouse too, and the click ending that swipe opens nothing.
      component.notice.set('');
      swipe(card('cadeaux'), 300, 150);
      expect(component.notice()).toBe(SHARED_LIST_NOTICE);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('still follows a touchpad swipe after a press released outside its card', async () => {
      ask.mockResolvedValue(false);
      // Pressed on a card, then let go elsewhere: no pointerup reaches the card.
      card('maison').dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: 200, bubbles: true }));

      const event = new WheelEvent('wheel', { deltaX: 60, bubbles: true, cancelable: true });
      card('courses').dispatchEvent(event);
      fixture.detectChanges();

      expect(event.defaultPrevented).toBe(true);
      expect(card('courses').style.transform).toBe('translateX(-58px)');
      await new Promise((resolve) => setTimeout(resolve, WHEEL_SWIPE_END_MS + 50));
      expect(ask).toHaveBeenCalledTimes(1);
      expect(ask.mock.lastCall![0].message).toContain('« Courses »');
    });

    it('asks to delete an own list with the Delete key, and not a shared one', () => {
      const press = (listId: string) =>
        card(listId).dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));

      press('cadeaux');
      expect(ask).not.toHaveBeenCalled();
      press('courses');
      expect(ask).toHaveBeenCalledTimes(1);
      expect(ask.mock.lastCall![0].message).toContain('« Courses »');
    });

    it('also deletes from the uncovered delete button', async () => {
      ask.mockResolvedValue(true);
      const button = element.querySelector('.list-item[data-list-id="maison"] .delete-list') as HTMLButtonElement;
      expect(button.getAttribute('aria-label')).toBe('Supprimer la liste Maison');

      button.click();
      await settle();

      http.expectOne({ method: 'DELETE', url: '/api/v1/lists/maison' }).flush(null);
    });
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
