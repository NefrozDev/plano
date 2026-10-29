import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectivesStore } from '../objectives.store';
import { provideObjectivesTesting } from '../objectives.testing';
import { ObjectivesOverviewComponent } from './objectives-overview.component';

describe('ObjectivesOverviewComponent', () => {
  let fixture: ComponentFixture<ObjectivesOverviewComponent>;
  let element: HTMLElement;
  let store: ObjectivesStore;

  const cardTitles = (): string[] =>
    Array.from(element.querySelectorAll('app-objective-card strong')).map((node) => node.textContent?.trim() ?? '');

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ObjectivesOverviewComponent],
      providers: provideObjectivesTesting(),
    });
    fixture = TestBed.createComponent(ObjectivesOverviewComponent);
    element = fixture.nativeElement as HTMLElement;
    store = TestBed.inject(ObjectivesStore);
    fixture.detectChanges();
  });

  it('lists objectives in progress and the latest completed one, with the shared navigation', () => {
    expect(element.querySelector('h1')?.textContent).toBe('Objectifs');
    expect(element.querySelectorAll('.tabs button').length).toBe(4);
    // Six objectives in progress (including the paused one) + one completed.
    expect(cardTitles().length).toBe(7);
    expect(element.textContent).toContain('Terminé le 30 août 2026');
    expect(element.textContent).toContain('En pause');
    expect(element.querySelector('.fab')?.getAttribute('href')).toBe('/objectives/new');
    expect(element.querySelector('app-bottom-nav .active')?.textContent).toContain('Objectifs');
  });

  it('switches tabs and labels the archived section', () => {
    (element.querySelectorAll('.tabs button')[3] as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(cardTitles()).toEqual(['Apprendre la guitare']);
    expect(element.querySelector('h2')?.textContent).toBe('Archivés');
  });

  it('expands the completed section when more than one objective is done', () => {
    for (const step of store.find('apprendre-italien')!.steps.filter((item) => !item.done)) {
      store.toggleStep('apprendre-italien', step.id);
    }
    fixture.detectChanges();
    const toggle = element.querySelector('.section-heading button') as HTMLButtonElement;
    expect(toggle.textContent).toContain('Voir tout (2)');

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
    const centre = (id: string) => {
      const box = (element.querySelector(`.objective-item[data-objective-id="${id}"]`) as HTMLElement).getBoundingClientRect();
      return [box.left + box.width / 2, box.top + box.height / 2] as const;
    };

    beforeEach(() => document.body.append(element));
    afterEach(() => element.remove());

    it('drags an objective by its grip onto another card, keeping the new order', () => {
      const [first, second, third] = ids() as string[];
      const grip = handle(third);
      expect(grip.getAttribute('aria-label')).toContain('Déplacer l’objectif');
      grip.setPointerCapture = vi.fn();

      pointer('pointerdown', grip);
      fixture.detectChanges();
      expect(grip.setPointerCapture).toHaveBeenCalledExactlyOnceWith(1);
      expect(element.querySelector('.objective-item.dragging')?.getAttribute('data-objective-id')).toBe(third);
      pointer('pointermove', grip, ...centre(first));
      pointer('pointerup', grip);
      fixture.detectChanges();

      expect(ids().slice(0, 3)).toEqual([third, first, second]);
      expect(store.objectives().slice(0, 3).map(({ id }) => id)).toEqual([third, first, second]);
      expect(element.querySelector('.objective-item.dragging')).toBeNull();
      // Moving after the drop does nothing.
      pointer('pointermove', grip, ...centre(second));
      fixture.detectChanges();
      expect(ids().slice(0, 3)).toEqual([third, first, second]);
    });

    it('moves an objective with the arrow keys of its grip', () => {
      const [first, second] = ids() as string[];
      const key = (id: string, name: string) => {
        const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
        handle(id).dispatchEvent(event);
        fixture.detectChanges();
        return event.defaultPrevented;
      };

      expect(key(first, 'ArrowDown')).toBe(true);
      expect(ids().slice(0, 2)).toEqual([second, first]);
      expect(key(second, 'ArrowUp')).toBe(true);
      expect(key(second, 'Tab')).toBe(false);
      expect(ids().slice(0, 2)).toEqual([second, first]);
    });

    it('hides the grips when another sort is chosen', () => {
      expect(element.querySelectorAll('.drag-handle').length).toBe(ids().length);

      store.filters.update((filters) => ({ ...filters, sort: 'title' }));
      fixture.detectChanges();

      expect(element.querySelector('.drag-handle')).toBeNull();
    });
  });
});
