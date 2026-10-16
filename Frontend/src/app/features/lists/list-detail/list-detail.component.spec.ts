import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import type { AuthUser } from '../../../core/auth/auth.models';
import { AuthService } from '../../../core/auth/auth.service';
import { ConfirmService } from '../../../shared/ui/confirm.service';
import { ListsStore } from '../lists.store';
import { ListDetailComponent } from './list-detail.component';

describe('ListDetailComponent', () => {
  let fixture: ComponentFixture<ListDetailComponent>;
  let component: ListDetailComponent;
  let element: HTMLElement;
  let store: ListsStore;

  const entryNames = (sectionId: string) =>
    component.sections().find(({ id }) => id === sectionId)?.entries.map(({ name }) => name);
  const render = () => {
    fixture.detectChanges();
    return element;
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ListDetailComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { user: signal<AuthUser | null>(null) } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ slug: 'courses' }) } },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ListDetailComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    store = TestBed.inject(ListsStore);
  });

  it('renders the list from the store, with progress derived from its entries', () => {
    render();

    expect(element.querySelector('.list-title')?.textContent).toContain('Courses');
    expect(element.querySelectorAll('.entry').length).toBe(12);
    expect(element.querySelector('.overall-progress strong')?.textContent).toBe('3 / 12');
    const firstSection = element.querySelector('.entry-section') as HTMLElement;
    expect(firstSection.style.getPropertyValue('--section-progress')).toBe('25%');

    component.toggleEntry('fresh', 'milk');
    render();

    expect(component.completed()).toBe(4);
    expect(store.list('courses')?.completed).toBe(4);
    expect(firstSection.style.getPropertyValue('--section-progress')).toBe('50%');
  });

  it('collapses only the section whose title is clicked, and reopens it', () => {
    (render().querySelector('.section-title') as HTMLButtonElement).click();
    render();

    expect(element.querySelectorAll('.section-summary').length).toBe(1);
    expect(element.querySelectorAll('.entry').length).toBe(8);
    expect((element.querySelector('.section-summary') as HTMLElement).style.getPropertyValue('--section-progress')).toBe('25%');

    component.toggleSection('fresh');
    expect(component.sectionViews()[0].collapsed).toBeFalse();
  });

  it('collapses a section automatically once all its entries are done', () => {
    component.toggleEntry('fresh', 'milk');
    component.toggleEntry('fresh', 'tomatoes');
    component.toggleEntry('fresh', 'salad');

    const summary = render().querySelector('.section-summary') as HTMLElement;
    expect(summary.textContent).toContain('4 / 4');
    expect(summary.style.getPropertyValue('--section-progress')).toBe('100%');
  });

  it('opens entry details from a row and edits the entry in the store', () => {
    (render().querySelector('.entry') as HTMLElement).click();
    render();

    expect(component.selected()).toEqual({ sectionId: 'fresh', entryId: 'milk' });
    expect(element.querySelector('.entry-details')).not.toBeNull();

    component.updateActiveEntry({ notes: 'Demi-écrémé' });
    expect(component.activeEntry()?.entry.notes).toBe('Demi-écrémé');

    (element.querySelector('.entry-details header button') as HTMLButtonElement).click();
    expect(component.selected()).toBeNull();
    component.updateActiveEntry({ notes: 'ignoré' });
    expect(store.detail('courses')?.sections[0].entries[0].notes).toBe('Demi-écrémé');
  });

  it('toggles completion only from the left circle', () => {
    (render().querySelector('.entry-toggle') as HTMLButtonElement).click();

    expect(component.sections()[0].entries[0].done).toBeTrue();
    expect(component.selected()).toBeNull();
  });

  it('adds an entry from the empty row, ignoring blanks and stale blur events', () => {
    component.beginAdding('fresh');
    component.finishAdding('fresh');
    expect(entryNames('fresh')?.length).toBe(4);

    component.beginAdding('grocery');
    component.newEntryValue.set('Farine');
    component.finishAdding('fresh');
    expect(component.addingTo()).toBe('grocery');

    component.beginAdding('fresh');
    component.newEntryValue.set('  Beurre  ');
    component.finishAdding('fresh');
    expect(entryNames('fresh')?.at(-1)).toBe('Beurre');
    expect(component.sections()[0].entries.at(-1)?.addedBy).toBe('Vous');
    expect(component.total()).toBe(13);

    component.beginAdding('fresh');
    component.cancelAdding();
    expect(component.addingTo()).toBeNull();
  });

  it('focuses the new entry input when it appears', () => {
    render();
    component.beginAdding('fresh');
    render();

    expect(document.activeElement).toBe(element.querySelector('.new-entry-input'));
  });

  it('asks before deleting an entry when confirmation is enabled', async () => {
    const confirm = spyOn(TestBed.inject(ConfirmService), 'ask').and.resolveTo(false);
    const milk = component.sections()[0].entries[0];

    await component.requestDeleteEntry('fresh', milk);
    expect(confirm).toHaveBeenCalledWith(jasmine.objectContaining({ message: jasmine.stringContaining('Lait') }));
    expect(entryNames('fresh')).toContain('Lait');

    confirm.and.resolveTo(true);
    await component.requestDeleteEntry('fresh', milk);
    expect(entryNames('fresh')).not.toContain('Lait');
    expect(component.total()).toBe(11);

    store.updateSettings({ confirmDelete: false });
    await component.requestDeleteEntry('fresh', component.sections()[0].entries[0]);
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  describe('dragging', () => {
    /** A detached row, as `elementFromPoint` would return under the pointer. */
    function row(sectionId: string, entryId: string): HTMLElement {
      const entry = document.createElement('div');
      entry.className = 'entry';
      entry.dataset['sectionId'] = sectionId;
      entry.dataset['entryId'] = entryId;
      return entry;
    }
    const pointer = () => new PointerEvent('pointermove', { cancelable: true });

    it('moves the dragged entry over rows of its own section only', () => {
      const pointFinder = spyOn(document, 'elementFromPoint').and.returnValue(row('fresh', 'tomatoes'));

      component.moveDrag(pointer());
      expect(pointFinder).not.toHaveBeenCalled();

      component.startDrag('fresh', 'milk');
      component.moveDrag(pointer());
      expect(entryNames('fresh')).toEqual(['Œufs', 'Tomates', 'Lait', 'Salade']);

      // Rows of other sections, the dragged row itself, or empty space are ignored.
      pointFinder.and.returnValue(row('grocery', 'pasta'));
      component.moveDrag(pointer());
      pointFinder.and.returnValue(row('fresh', 'milk'));
      component.moveDrag(pointer());
      pointFinder.and.returnValue(null);
      component.moveDrag(pointer());
      expect(entryNames('fresh')).toEqual(['Œufs', 'Tomates', 'Lait', 'Salade']);

      component.endDrag();
      expect(component.dragged()).toBeNull();
    });

    it('marks the dragged row', () => {
      component.startDrag('fresh', 'milk');
      render();
      expect(element.querySelectorAll('.entry.dragging').length).toBe(1);
    });
  });

  describe('panels', () => {
    it('opens the list editor from the menu and saves it to the store', () => {
      component.toggleListMenu();
      expect(render().textContent).toContain('Modifier la liste');

      component.openListEditor();
      render();
      expect(component.listMenuOpen()).toBeFalse();
      expect(element.querySelector('app-list-editor')).not.toBeNull();

      component.saveList({ name: 'Courses du week-end', icon: 'gift', color: '#e65591', description: 'Samedi' });
      render();

      expect(component.listEditorOpen()).toBeFalse();
      expect(element.querySelector('.list-title')?.textContent).toContain('Courses du week-end');
      expect(store.list('courses')).toEqual(jasmine.objectContaining({ icon: 'gift', color: '#e65591' }));
      expect(store.detail('courses')?.description).toBe('Samedi');
    });

    it('adds a section from the section creator', () => {
      component.toggleListMenu();
      component.openSectionCreator();
      expect(render().querySelector('app-list-section-creator')).not.toBeNull();

      component.addSection({ name: 'Surgelés', color: '#3978ed' });
      render();

      expect(component.sectionCreatorOpen()).toBeFalse();
      expect(component.sections().at(-1)?.name).toBe('Surgelés');
      expect(element.querySelectorAll('.entry-section').length).toBe(5);
    });

    it('opens and closes the sharing panel', () => {
      (render().querySelector('.members button') as HTMLButtonElement).click();
      expect(render().querySelector('.sharing-panel')).not.toBeNull();

      (element.querySelector('.sharing-panel header button') as HTMLButtonElement).click();
      expect(render().querySelector('.sharing-panel')).toBeNull();
    });
  });

  it('applies the hide-completed and keep-order display settings', () => {
    const freshNames = () => component.sectionViews()[0].entries.map(({ name }) => name);

    // Default: completed entries are shown, sorted last.
    expect(freshNames().at(-1)).toBe('Œufs');

    store.updateSettings({ completedLast: false });
    expect(freshNames()[1]).toBe('Œufs');

    store.updateSettings({ showCompleted: false });
    expect(freshNames()).not.toContain('Œufs');
  });

  it('does not select UI text but keeps editor text selectable', () => {
    expect(getComputedStyle(render().querySelector('.section-title') as HTMLElement).userSelect).toBe('none');

    component.openListEditor();
    const input = render().querySelector('.editor-field input') as HTMLInputElement;
    expect(getComputedStyle(input).userSelect).toBe('text');
  });
});
