import type { MockInstance } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { FriendNotificationsService } from '../../../core/friends/friend-notifications.service';
import { ObjectivesStore } from '../objectives.store';
import { flushObjectives, provideObjectivesTesting, settleObjectives } from '../objectives.testing';
import { objectiveSummary } from '../testing/objectives-fixtures';
import { ObjectivesOverviewComponent } from './objectives-overview.component';

const OBJECTIVES = [
  objectiveSummary({
    id: 'run',
    title: 'Courir',
    percent: 65,
    amount: { current: 6.5, target: 10, unit: 'km' },
    dueDate: '2026-11-30',
  }),
  objectiveSummary({ id: 'read', title: 'Lire', status: 'paused', percent: 20, category: 'learning' }),
  objectiveSummary({ id: 'trip', title: 'Voyage', timelapse: 'elapsed', startDate: '2026-10-01', dueDate: '2026-10-10' }),
  objectiveSummary({ id: 'done', title: 'Fini', status: 'completed', percent: 100, completedAt: '2026-08-30T12:00:00.000Z' }),
  objectiveSummary({ id: 'guitar', title: 'Guitare', archived: true }),
];

describe('ObjectivesOverviewComponent', () => {
  let fixture: ComponentFixture<ObjectivesOverviewComponent>;
  let element: HTMLElement;
  let store: ObjectivesStore;
  let http: HttpTestingController;

  const cardTitles = (): string[] =>
    Array.from(element.querySelectorAll('app-objective-card strong')).map((node) => node.textContent?.trim() ?? '');

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [ObjectivesOverviewComponent],
      providers: provideObjectivesTesting(),
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ObjectivesOverviewComponent);
    element = fixture.nativeElement as HTMLElement;
    store = TestBed.inject(ObjectivesStore);
    await flushObjectives(OBJECTIVES);
    fixture.detectChanges();
  });

  it('lists objectives in progress and the latest completed one, with the shared navigation', () => {
    expect(element.querySelector('h1')?.textContent).toBe('Objectifs');
    expect(element.querySelectorAll('.tabs button').length).toBe(4);
    expect(cardTitles()).toEqual(['Courir', 'Lire', 'Voyage', 'Fini']);
    expect(element.textContent).toContain('Terminé le 30 août 2026');
    expect(element.textContent).toContain('En pause');
    expect(element.querySelector('.fab')?.getAttribute('href')).toBe('/objectives/new');
    expect(element.querySelector('app-bottom-nav .active')?.textContent).toContain('Objectifs');
  });

  it('shows the timelapse bar of the objectives that have one', () => {
    const bars = element.querySelectorAll('app-timelapse-bar');

    expect(bars.length).toBe(1);
    expect(bars[0].textContent).toContain('5 jours de retard');
    expect(bars[0].classList).toContain('overdue');
  });

  it('shows an error from the API, and no empty state while loading', async () => {
    const reloading = store.load();
    fixture.detectChanges();
    http.expectOne('/api/v1/objectives').flush({ message: 'Hors service' }, { status: 500, statusText: 'Error' });
    await reloading;
    fixture.detectChanges();

    expect(element.querySelector('.field-error')?.textContent).toBe('Hors service');
  });

  it('leads from the bell to the friends settings, with a badge for friend news', () => {
    const bell = element.querySelector('.notifications-link') as HTMLAnchorElement;
    expect(bell.getAttribute('href')).toBe('/settings');
    expect(bell.querySelector('.badge')).toBeNull();

    TestBed.inject(FriendNotificationsService).incoming.set(1);
    fixture.detectChanges();

    expect(bell.querySelector('.badge')?.textContent).toBe('1');
    expect(bell.getAttribute('aria-label')).toBe('Notifications : 1 nouvelle(s)');
  });

  it('switches tabs and labels the archived section', () => {
    (element.querySelectorAll('.tabs button')[3] as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(cardTitles()).toEqual(['Guitare']);
    expect(element.querySelector('h2')?.textContent).toBe('Archivés');
  });

  it('expands the completed section when more than one objective is done', async () => {
    const reloading = store.load();
    http
      .expectOne('/api/v1/objectives')
      .flush([...OBJECTIVES, objectiveSummary({ id: 'done-2', title: 'Fini aussi', status: 'completed', percent: 100 })]);
    await reloading;
    fixture.detectChanges();
    const toggle = element.querySelector('.section-heading button') as HTMLButtonElement;
    expect(toggle.textContent).toContain('Voir tout (2)');
    expect(fixture.componentInstance.visibleCompleted().length).toBe(1);

    toggle.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.visibleCompleted().length).toBe(2);
    expect(toggle.textContent).toContain('Réduire');
  });

  it('applies display settings: grid tiles and progress as amounts', () => {
    store.updateSettings({ defaultView: 'grid', showPercentage: false });
    fixture.detectChanges();

    expect(element.querySelector('.content')?.classList).toContain('grid-view');
    expect(element.querySelector('app-objective-card')?.classList).toContain('tile');
    expect(element.textContent).toContain('6,5 / 10 km');
  });

  it('shows active filters with a reset shortcut and an empty state', () => {
    store.filters.set({ statuses: ['paused'], categories: ['finance'], sort: 'dueDate', direction: 'asc' });
    fixture.detectChanges();

    expect(element.querySelector('.badge')?.textContent).toBe('2');
    expect(element.querySelector('.empty-state')).not.toBeNull();

    (element.querySelector('.filter-note button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(store.activeFilterCount()).toBe(0);
    expect(element.querySelector('.filter-note')).toBeNull();
  });

  it('switches between list and grid from the header and remembers the choice', () => {
    const toggle = element.querySelector('.overview-header > button.icon-button') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(toggle.getAttribute('aria-label')).toBe('Afficher les objectifs en grille');

    toggle.click();
    fixture.detectChanges();
    expect(store.settings().defaultView).toBe('grid');
    expect(element.querySelector('.content')?.classList).toContain('grid-view');
    expect(toggle.getAttribute('aria-label')).toBe('Afficher les objectifs en liste');

    toggle.click();
    fixture.detectChanges();
    expect(store.settings().defaultView).toBe('list');
  });

  it('opens filters from their own icon next to search, not from the view toggle', () => {
    const filters = element.querySelector('[aria-label="Filtrer et trier les objectifs"]');

    expect(filters?.getAttribute('href')).toBe('/objectives/filters');
    expect(filters?.closest('.header-actions')).not.toBeNull();
  });

  it('opens the overflow menu with settings', () => {
    (element.querySelector('.more-button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(element.querySelector('.overview-menu a')?.getAttribute('href')).toBe('/objectives/settings');
  });

  describe('custom order', () => {
    const ids = () =>
      Array.from(element.querySelectorAll<HTMLElement>('.content .objective-item')).map((item) => item.dataset['objectiveId']);
    const handle = (id: string) =>
      element.querySelector(`.objective-item[data-objective-id="${id}"] .drag-handle`) as HTMLButtonElement;
    const pointer = (type: string, target: Element, x = 0, y = 0) =>
      target.dispatchEvent(new PointerEvent(type, { pointerId: 1, clientX: x, clientY: y, bubbles: true, cancelable: true }));
    /**
     * What lies under the pointer is the browser's business: the specs say which
     * card it is, instead of depending on the test page's size and layout (on CI,
     * the bottom navigation could cover the aimed-at card).
     */
    let under: Element | null = null;
    let elementFromPoint: MockInstance<Document['elementFromPoint']>;
    /** Puts the pointer over a card's title; returns arbitrary coordinates for the event. */
    const centre = (id: string) => {
      under = element.querySelector(`.objective-item[data-objective-id="${id}"] app-objective-card strong`);
      return [150, 260] as const;
    };

    beforeEach(() => {
      under = null;
      elementFromPoint = vi.spyOn(document, 'elementFromPoint').mockImplementation(() => under);
    });
    afterEach(() => elementFromPoint.mockRestore());

    it('drags an objective by its grip onto another card, and saves the order on release', async () => {
      const grip = handle('trip');
      expect(grip.getAttribute('aria-label')).toContain('Déplacer l’objectif');
      grip.setPointerCapture = vi.fn();

      pointer('pointerdown', grip);
      fixture.detectChanges();
      expect(grip.setPointerCapture).toHaveBeenCalledExactlyOnceWith(1);
      expect(element.querySelector('.objective-item.dragging')?.getAttribute('data-objective-id')).toBe('trip');
      pointer('pointermove', grip, ...centre('run'));
      fixture.detectChanges();

      expect(elementFromPoint).toHaveBeenCalledExactlyOnceWith(150, 260);
      expect(ids()).toEqual(['trip', 'run', 'read', 'done']);
      // Nothing is saved before the drop.
      http.expectNone('/api/v1/objectives/order');

      pointer('pointerup', grip);
      fixture.detectChanges();
      const saved = http.expectOne('/api/v1/objectives/order');
      expect(saved.request.body).toEqual({ objectiveIds: ['trip', 'run', 'read', 'done', 'guitar'] });
      saved.flush(null);
      await settleObjectives();
      expect(element.querySelector('.objective-item.dragging')).toBeNull();

      // Moving after the drop does nothing.
      pointer('pointermove', grip, ...centre('read'));
      fixture.detectChanges();
      expect(ids()).toEqual(['trip', 'run', 'read', 'done']);
    });

    it('saves nothing for a drag that moved nothing, and ignores moves without a drag', () => {
      pointer('pointermove', element, ...centre('read'));
      // Not dragging: the page is not even searched.
      expect(elementFromPoint).not.toHaveBeenCalled();

      const grip = handle('read');
      grip.setPointerCapture = vi.fn();
      pointer('pointerdown', grip);
      pointer('pointermove', grip, ...centre('read'));
      pointer('pointerup', grip);
      pointer('pointerup', grip);

      http.expectNone('/api/v1/objectives/order');
    });

    it('moves an objective with the arrow keys of its grip, saving each move', async () => {
      const key = (id: string, name: string) => {
        const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
        handle(id).dispatchEvent(event);
        fixture.detectChanges();
        return event.defaultPrevented;
      };

      expect(key('run', 'ArrowDown')).toBe(true);
      expect(ids().slice(0, 2)).toEqual(['read', 'run']);
      http.expectOne('/api/v1/objectives/order').flush(null);
      await settleObjectives();

      // Already first: nothing to move past, nothing to save.
      expect(key('read', 'ArrowUp')).toBe(true);
      expect(key('read', 'Tab')).toBe(false);
      expect(ids().slice(0, 2)).toEqual(['read', 'run']);
      http.expectNone('/api/v1/objectives/order');
    });

    it('hides the grips when another sort is chosen', () => {
      expect(element.querySelectorAll('.drag-handle').length).toBe(ids().length);

      store.filters.update((filters) => ({ ...filters, sort: 'title' }));
      fixture.detectChanges();

      expect(element.querySelector('.drag-handle')).toBeNull();
    });
  });
});
