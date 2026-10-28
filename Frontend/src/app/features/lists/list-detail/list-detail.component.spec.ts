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

  it('collapses only the section whose chevron is clicked, and reopens it', async () => {
    await create();

    (element.querySelector('.collapse') as HTMLButtonElement).click();
    await render();
    expect(element.querySelectorAll('.section-summary').length).toBe(1);
    expect(element.querySelectorAll('.entry').length).toBe(2);
    expect(element.querySelector('.name-input')).toBeNull();

    (element.querySelector('.section-summary') as HTMLButtonElement).click();
    await render();
    expect(component.sectionViews()[0].collapsed).toBe(false);
  });

  describe('section titles', () => {
    const title = () => element.querySelector('.entry-section .section-title') as HTMLButtonElement;
    const nameInput = () => element.querySelector('.name-input') as HTMLInputElement | null;
    const type = async (value: string, key: 'Enter' | 'Escape') => {
      const input = nameInput()!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new KeyboardEvent('keydown', { key }));
      await render();
    };

    it('renames a section from its title, trimmed, once', async () => {
      await create();
      title().click();
      await render();
      expect(nameInput()?.value).toBe('Produits frais');
      expect(document.activeElement).toBe(nameInput());

      await type('  Frais  ', 'Enter');
      const request = http.expectOne({ method: 'PATCH', url: '/api/v1/lists/list-1/sections/fresh' });
      expect(request.request.body).toEqual({ name: 'Frais' });
      request.flush(null);
      await render();

      expect(nameInput()).toBeNull();
      expect(title().textContent?.trim()).toBe('Frais');
      expect(component.list()?.sections[0].entries.length).toBe(4);
    });

    it('sends nothing when the name is cancelled, blank or unchanged', async () => {
      await create();
      const rename = vi.spyOn(store, 'renameSection');

      for (const [value, key] of [['Autre', 'Escape'], ['   ', 'Enter'], ['Produits frais', 'Enter']] as const) {
        title().click();
        await render();
        await type(value, key);
        expect(nameInput()).toBeNull();
      }
      nameInput()?.dispatchEvent(new Event('blur'));

      expect(rename).not.toHaveBeenCalled();
      expect(title().textContent?.trim()).toBe('Produits frais');
    });

    it('deletes a section with its entries only once confirmed', async () => {
      await create();
      const confirm = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(false);
      const fresh = component.list()!.sections[0];

      await component.requestDeleteSection(fresh);
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(confirm).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('« Produits frais » et ses 4 éléments'), tone: 'danger' }),
      );
      expect(component.list()?.sections.length).toBe(2);

      confirm.mockResolvedValue(true);
      const deleting = component.requestDeleteSection(fresh);
      await settle();
      http.expectOne({ method: 'DELETE', url: '/api/v1/lists/list-1/sections/fresh' }).flush(null);
      await deleting;
      await render();

      expect(component.list()?.sections.map(({ id }) => id)).not.toContain('fresh');
      expect(component.list()?.total).toBe(2);
      expect(element.querySelectorAll('.entry').length).toBe(2);
    });

    it('opens the delete confirmation from the section delete button', async () => {
      await create();
      const ask = vi.spyOn(component, 'requestDeleteSection').mockResolvedValue();

      (element.querySelector('.delete-section') as HTMLButtonElement).click();

      expect(ask).toHaveBeenCalledTimes(1);
      expect(ask).toHaveBeenCalledWith(component.list()!.sections[0]);
    });
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

  it('styles the entry name as a text field while it is being edited', async () => {
    await create();
    // These global rules are scoped to the app-list-detail tag, which the test root lacks.
    const scope = document.body.appendChild(document.createElement('app-list-detail'));
    scope.appendChild(element);
    try {
      (element.querySelector('.entry-name') as HTMLButtonElement).click();
      await render();
      const input = element.querySelector('.entry-name-editor input') as HTMLInputElement;
      const look = () => {
        const style = getComputedStyle(input);
        return { border: style.borderTopColor, background: style.backgroundColor, ring: style.boxShadow };
      };
      // Transitions would make the computed values lag behind the focus change.
      input.style.transition = 'none';
      const resting = look();

      input.focus();
      const editing = look();

      expect(resting.border).toBe('rgba(0, 0, 0, 0)');
      expect(resting.ring).toBe('none');
      expect(editing.border).not.toBe(resting.border);
      expect(editing.background).not.toBe(resting.background);
      expect(editing.ring).not.toBe('none');
    } finally {
      scope.remove();
    }
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
    const confirm = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(false);
    const milk = component.list()!.sections[0].entries[0];

    await component.requestDeleteEntry(milk);
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Lait') }),
    );

    confirm.mockResolvedValue(true);
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
      const pointFinder = vi
        .spyOn(document, 'elementFromPoint')
        .mockReturnValue(row('fresh', 'tomatoes'));

      component.moveDrag(pointer());
      expect(pointFinder).not.toHaveBeenCalled();

      component.startDrag('fresh', 'milk');
      component.moveDrag(pointer());
      pointFinder.mockReturnValue(row('grocery', 'pasta'));
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
    expect((element.querySelector('.entry-toggle') as HTMLButtonElement).disabled).toBe(true);
    expect(element.querySelector('.members button')).toBeNull();
    expect(element.querySelector('.delete-section')).toBeNull();
    expect(element.querySelector('.collapse')).toBeNull();

    // Viewers fold a section with its title instead of renaming it.
    (element.querySelector('.entry-section .section-title') as HTMLButtonElement).click();
    await render();
    expect(element.querySelector('.name-input')).toBeNull();
    expect(component.sectionViews()[0].collapsed).toBe(true);
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
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      component.toggleListMenu();
      component.openListEditor();
      await render();

      const saving = component.saveList({ name: 'Courses du samedi', icon: 'gift', color: '#e65591', description: 'Samedi' });
      const update = http.expectOne({ method: 'PATCH', url: '/api/v1/lists/list-1' });
      expect(update.request.body).toEqual({ name: 'Courses du samedi', icon: 'gift', color: '#e65591', description: 'Samedi' });
      update.flush(listDetail({ name: 'Courses du samedi' }));
      await saving;
      expect((await render()).querySelector('.list-title')?.textContent).toContain(
        'Courses du samedi',
      );
      expect(component.listEditorOpen()).toBe(false);

      vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);
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

      expect(component.sectionCreatorOpen()).toBe(false);
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
