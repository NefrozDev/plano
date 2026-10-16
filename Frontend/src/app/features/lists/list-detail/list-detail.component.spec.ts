import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import type { ListDetail, ListSettings } from '@plano/common';
import { ConfirmService } from '../../../shared/ui/confirm.service';
import { providePlanoTesting, settle } from '../../../testing/plano-testing';
import { ListsStore } from '../lists.store';
import { entry, listDetail, listSettings } from '../testing/lists-fixtures';
import { ListDetailComponent } from './list-detail.component';

describe('ListDetailComponent', () => {
  let fixture: ComponentFixture<ListDetailComponent>;
  let component: ListDetailComponent;
  let element: HTMLElement;
  let http: HttpTestingController;
  let store: ListsStore;

  async function create(
    options: { detail?: ListDetail | null; settings?: ListSettings; query?: Record<string, string> } = {},
  ): Promise<void> {
    TestBed.configureTestingModule({
      imports: [ListDetailComponent],
      providers: [
        providePlanoTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ listId: 'list-1' }),
              queryParamMap: convertToParamMap(options.query ?? {}),
            },
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(ListsStore);
    fixture = TestBed.createComponent(ListDetailComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;

    const detailRequest = http.expectOne('/api/v1/lists/list-1');
    if (options.detail === null) {
      detailRequest.flush({ message: 'Liste introuvable.' }, { status: 404, statusText: 'Not Found' });
    } else {
      detailRequest.flush(options.detail ?? listDetail());
    }
    http.expectOne('/api/v1/settings/lists').flush(options.settings ?? listSettings());
    await render();
  }

  async function render(): Promise<HTMLElement> {
    await settle();
    fixture.detectChanges();
    return element;
  }

  const entryNames = (sectionIndex = 0) => component.sectionViews()[sectionIndex].entries.map(({ name }) => name);

  afterEach(() => http.verify());

  it('renders the list from the API with its progress', async () => {
    await create();

    expect(element.querySelector('.list-title')?.textContent).toContain('Courses');
    expect(element.querySelectorAll('.entry').length).toBe(6);
    expect(element.querySelector('.overall-progress strong')?.textContent).toBe('2 / 6');
    const firstSection = element.querySelector('.entry-section') as HTMLElement;
    expect(firstSection.style.getPropertyValue('--section-progress')).toBe('25%');
  });

  it('toggles an entry through the API and folds a completed section', async () => {
    await create({
      detail: listDetail({
        sections: [{ id: 'fresh', name: 'Frais', color: '#23c666', entries: [entry('milk', 'Lait'), entry('eggs', 'Œufs', { done: true })] }],
      }),
    });

    (element.querySelector('.entry-toggle') as HTMLButtonElement).click();
    const request = http.expectOne('/api/v1/lists/list-1/entries/milk');
    expect(request.request.body).toEqual({ done: true });
    request.flush(entry('milk', 'Lait', { done: true }));
    await render();

    expect(component.selected()).toBeNull();
    const summary = element.querySelector('.section-summary') as HTMLElement;
    expect(summary.textContent).toContain('2 / 2');
  });

  it('collapses only the section whose title is clicked, and reopens it', async () => {
    await create();

    (element.querySelector('.section-title') as HTMLButtonElement).click();
    await render();
    expect(element.querySelectorAll('.section-summary').length).toBe(1);
    expect(element.querySelectorAll('.entry').length).toBe(2);

    component.toggleSection('fresh');
    expect(component.sectionViews()[0].collapsed).toBeFalse();
  });

  it('opens entry details, offering the list members as assignees', async () => {
    await create();

    (element.querySelector('.entry-name') as HTMLButtonElement).click();
    await render();

    expect(component.selected()).toEqual({ sectionId: 'fresh', entryId: 'milk' });
    const options = Array.from(element.querySelectorAll('.entry-details select option')).map((option) => option.textContent);
    expect(options).toEqual(['Non assigné', 'Ada Lovelace', 'Bob Martin']);

    component.updateActiveEntry({ notes: 'Demi-écrémé' });
    http.expectOne('/api/v1/lists/list-1/entries/milk').flush(entry('milk', 'Lait', { notes: 'Demi-écrémé' }));
    await render();
    expect(component.activeEntry()?.entry.notes).toBe('Demi-écrémé');
  });

  it('adds an entry from the empty row and ignores blanks and stale blur events', async () => {
    await create();

    component.beginAdding('fresh');
    component.finishAdding('fresh');
    component.beginAdding('grocery');
    component.newEntryValue.set('Farine');
    component.finishAdding('fresh');
    expect(component.addingTo()).toBe('grocery');

    component.beginAdding('fresh');
    component.newEntryValue.set('  Beurre  ');
    component.finishAdding('fresh');
    const request = http.expectOne('/api/v1/lists/list-1/sections/fresh/entries');
    expect(request.request.body).toEqual({ name: 'Beurre' });
    request.flush(entry('butter', 'Beurre'));
    await render();

    expect(component.list()?.total).toBe(7);
    expect(component.addingTo()).toBeNull();
  });

  it('focuses the new entry input when it appears', async () => {
    await create();

    component.beginAdding('fresh');
    await render();

    expect(document.activeElement).toBe(element.querySelector('.new-entry-input'));
  });

  it('asks before deleting an entry when the setting says so', async () => {
    await create();
    const confirm = spyOn(TestBed.inject(ConfirmService), 'ask').and.resolveTo(false);
    const milk = component.list()!.sections[0].entries[0];

    await component.requestDeleteEntry(milk);
    expect(confirm).toHaveBeenCalledWith(jasmine.objectContaining({ message: jasmine.stringContaining('Lait') }));

    confirm.and.resolveTo(true);
    const deleting = component.requestDeleteEntry(milk);
    await settle();
    http.expectOne({ method: 'DELETE', url: '/api/v1/lists/list-1/entries/milk' }).flush(null);
    await deleting;
    expect(component.list()?.total).toBe(5);
  });

  describe('dragging', () => {
    /** A detached row, as `elementFromPoint` would return under the pointer. */
    function row(sectionId: string, entryId: string): HTMLElement {
      const target = document.createElement('div');
      target.className = 'entry';
      target.dataset['sectionId'] = sectionId;
      target.dataset['entryId'] = entryId;
      return target;
    }
    const pointer = () => new PointerEvent('pointermove', { cancelable: true });

    it('reorders locally within the section and saves once on drop', async () => {
      await create({ settings: listSettings({ completedLast: false }) });
      const pointFinder = spyOn(document, 'elementFromPoint').and.returnValue(row('fresh', 'tomatoes'));

      component.moveDrag(pointer());
      expect(pointFinder).not.toHaveBeenCalled();

      component.startDrag('fresh', 'milk');
      component.moveDrag(pointer());
      pointFinder.and.returnValue(row('grocery', 'pasta'));
      component.moveDrag(pointer());
      expect(entryNames()).toEqual(['Œufs', 'Tomates', 'Lait', 'Salade']);

      component.endDrag();
      const order = http.expectOne('/api/v1/lists/list-1/sections/fresh/order');
      expect(order.request.body).toEqual({ entryIds: ['eggs', 'tomatoes', 'milk', 'salad'] });
      order.flush(null);
      expect(component.dragged()).toBeNull();
    });

    it('saves nothing when the drag moved nothing', async () => {
      await create();

      component.startDrag('fresh', 'milk');
      component.endDrag();

      http.expectNone('/api/v1/lists/list-1/sections/fresh/order');
    });
  });

  it('lets viewers read the list without editing controls', async () => {
    await create({ detail: listDetail({ role: 'viewer', ownership: 'shared' }) });

    expect(element.querySelector('.more-button')).toBeNull();
    expect(element.querySelector('.empty-entry')).toBeNull();
    expect(element.querySelector('.drag-handle')).toBeNull();
    expect((element.querySelector('.entry-toggle') as HTMLButtonElement).disabled).toBeTrue();
    expect(element.querySelector('.members button')).toBeNull();
  });

  it('explains when the list cannot be opened', async () => {
    await create({ detail: null });

    expect(element.querySelector('[role="alert"]')?.textContent).toContain('n’existe pas');
    expect(element.querySelector('app-toast')?.textContent).toContain('Liste introuvable.');
  });

  describe('owner actions', () => {
    it('opens the editor of a freshly created list', async () => {
      await create({ query: { edit: '1' } });

      expect(element.querySelector('app-list-editor')).not.toBeNull();
    });

    it('saves the editor and deletes the list', async () => {
      await create();
      const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
      component.toggleListMenu();
      component.openListEditor();
      await render();

      const saving = component.saveList({ name: 'Courses du samedi', icon: 'gift', color: '#e65591', description: 'Samedi' });
      const update = http.expectOne({ method: 'PATCH', url: '/api/v1/lists/list-1' });
      expect(update.request.body).toEqual({ name: 'Courses du samedi', icon: 'gift', color: '#e65591', description: 'Samedi' });
      update.flush(listDetail({ name: 'Courses du samedi' }));
      await saving;
      expect((await render()).querySelector('.list-title')?.textContent).toContain('Courses du samedi');
      expect(component.listEditorOpen()).toBeFalse();

      spyOn(TestBed.inject(ConfirmService), 'ask').and.resolveTo(true);
      const deleting = component.deleteList();
      await settle();
      http.expectOne({ method: 'DELETE', url: '/api/v1/lists/list-1' }).flush(null);
      await deleting;
      expect(navigate).toHaveBeenCalledWith('/lists');
    });

    it('adds a section from the section creator', async () => {
      await create();
      component.openSectionCreator();

      const adding = component.addSection({ name: 'Surgelés', color: '#3978ed' });
      http
        .expectOne('/api/v1/lists/list-1/sections')
        .flush({ id: 'frozen', name: 'Surgelés', color: '#3978ed', entries: [] });
      await adding;
      await render();

      expect(component.sectionCreatorOpen()).toBeFalse();
      expect(element.querySelectorAll('.entry-section').length).toBe(3);
    });
  });

  it('applies the hide-completed and keep-order display settings', async () => {
    await create({ settings: listSettings({ completedLast: false }) });
    expect(entryNames()[1]).toBe('Œufs');

    store.updateSettings({ completedLast: true });
    http.expectOne('/api/v1/settings/lists').flush(listSettings());
    expect(entryNames().at(-1)).toBe('Œufs');
  });

  it('does not select UI text but keeps editor text selectable', async () => {
    await create();
    expect(getComputedStyle(element.querySelector('.section-title') as HTMLElement).userSelect).toBe('none');

    component.openListEditor();
    const input = (await render()).querySelector('.editor-field input') as HTMLInputElement;
    expect(getComputedStyle(input).userSelect).toBe('text');
  });
});
