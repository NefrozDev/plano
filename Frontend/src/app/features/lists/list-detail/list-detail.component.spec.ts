import { onTestFinished } from 'vitest';
import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import type { ListDetail, ListSettings } from '@plano/common';
import { ConfirmService } from '../../../shared/ui/confirm.service';
import { NotificationsStore } from '../../../core/notifications/notifications.store';
import { notification } from '../../../testing/notifications-fixtures';
import { emptyNotifications, providePlanoTesting, settle } from '../../../testing/plano-testing';
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
      detailRequest.flush({ errorCode: 'lists.notFound' }, { status: 404, statusText: 'Not Found' });
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

  it('reads the notifications about this list while it is open, not those of other lists', async () => {
    await create();
    const notifications = TestBed.inject(NotificationsStore);
    const loading = notifications.load();
    http.expectOne('/api/v1/notifications').flush({
      items: [notification({ id: 'here', targetId: 'list-1' }), notification({ id: 'there', targetId: 'list-2' })],
      unread: { ...emptyNotifications().unread, lists: 2 },
    });
    await loading;
    fixture.detectChanges();

    const read = http.expectOne({ method: 'POST', url: '/api/v1/notifications/read' });
    expect(read.request.body).toEqual({ area: 'lists', targetId: 'list-1' });
    read.flush(null);
    expect(notifications.hasUnread('lists', 'list-2')).toBe(true);
    expect(notifications.unread().lists).toBe(1);
  });

  it('marks the entries others added with the yellow dot, and keeps it once read', async () => {
    await create();
    const notifications = TestBed.inject(NotificationsStore);
    const loading = notifications.load();
    http.expectOne('/api/v1/notifications').flush({
      items: [
        notification({ id: 'here', targetId: 'list-1', itemIds: ['milk'] }),
        // Another list's entries are not marked here.
        notification({ id: 'there', targetId: 'list-2', itemIds: ['bread'] }),
      ],
      unread: { ...emptyNotifications().unread, lists: 2 },
    });
    await loading;
    fixture.detectChanges();
    http.expectOne({ method: 'POST', url: '/api/v1/notifications/read' }).flush(null);
    await render();

    const marked = [...element.querySelectorAll('app-list-entry-row')].filter((row) => row.querySelector('app-news-dot'));
    expect(marked.map((row) => row.querySelector('.entry-name')?.textContent?.trim())).toEqual(['Lait']);
    expect(marked[0].querySelector('app-news-dot [role="img"]')?.getAttribute('aria-label')).toBe('Nouveau');
    expect(notifications.hasUnread('lists', 'list-1')).toBe(false);
  });

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

  it('deletes a checked item in a list set to remove them, keeping its section open', async () => {
    await create({ detail: listDetail({ removeChecked: true }) });
    const section = component.list()!.sections[0];
    const open = section.entries.filter(({ done }) => !done);

    for (const entry of open) {
      const toggling = component.toggleEntry(section.id, entry);
      http.expectOne({ method: 'DELETE', url: `/api/v1/lists/list-1/entries/${entry.id}` }).flush(null);
      await toggling;
    }
    await render();

    http.expectNone({ method: 'PATCH' });
    expect(component.list()!.sections[0].entries.every(({ done }) => done)).toBe(true);
    // Unchecking a done item never deletes it.
    const done = component.list()!.sections[0].entries[0];
    const unchecking = component.toggleEntry(section.id, done);
    const patch = http.expectOne({ method: 'PATCH', url: `/api/v1/lists/list-1/entries/${done.id}` });
    expect(patch.request.body).toEqual({ done: false });
    patch.flush({ ...done, done: false });
    await unchecking;
  });

  it('keeps a section emptied by removed items open', async () => {
    await create({ detail: listDetail({ removeChecked: true }) });
    const section = component.list()!.sections[1];

    for (const entry of section.entries) {
      const toggling = entry.done
        ? component.store.removeEntry(entry.id)
        : component.toggleEntry(section.id, entry);
      http.expectOne({ method: 'DELETE', url: `/api/v1/lists/list-1/entries/${entry.id}` }).flush(null);
      await toggling;
    }
    await render();

    expect(component.list()!.sections[1].entries).toEqual([]);
    expect(component.collapsedSections()).not.toContain(section.id);
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
    const nameInput = () => element.querySelector('.name-input') as HTMLTextAreaElement | null;
    const type = async (value: string, key: 'Enter' | 'Escape') => {
      const input = nameInput()!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
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

    it('opens the name for a real tap: pressing does not capture the pointer away from it', async () => {
      await create();
      const capture = vi.spyOn(HTMLElement.prototype, 'setPointerCapture');
      const press = (type: string, x = 40) =>
        title().dispatchEvent(new PointerEvent(type, { pointerId: 1, clientX: x, bubbles: true }));

      press('pointerdown');
      press('pointerup');
      title().click();
      await render();

      // Captured, the click would land on the header and never reach the name.
      expect(capture).not.toHaveBeenCalled();
      expect(nameInput()?.value).toBe('Produits frais');
      capture.mockRestore();
    });

    it('gives the section another colour from its title, at once, and keeps the name open', async () => {
      await create();
      const section = () => element.querySelector('.entry-section') as HTMLElement;
      const colours = () => Array.from(element.querySelectorAll<HTMLButtonElement>('.entry-section .color'));
      title().click();
      await render();
      expect(colours().map((colour) => colour.getAttribute('aria-pressed'))).not.toContain('true');

      colours()[3].click();
      const request = http.expectOne({ method: 'PATCH', url: '/api/v1/lists/list-1/sections/fresh' });
      expect(request.request.body).toEqual({ color: '#e65591' });
      request.flush(null);
      await render();

      expect(section().style.getPropertyValue('--section-color')).toBe('#e65591');
      expect(colours().map((colour) => colour.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false', 'true', 'false']);
      // Still editing: the name can be changed in the same go.
      expect(nameInput()?.value).toBe('Produits frais');
      await type('Frais', 'Enter');
      const rename = http.expectOne({ method: 'PATCH', url: '/api/v1/lists/list-1/sections/fresh' });
      expect(rename.request.body).toEqual({ name: 'Frais' });
      rename.flush(null);
    });

    it('offers viewers neither the name nor the colours', async () => {
      await create({ detail: listDetail({ role: 'viewer', ownership: 'shared' }) });

      title().click();
      await render();

      expect(nameInput()).toBeNull();
      expect(element.querySelector('.entry-section .color')).toBeNull();
      http.expectNone({ method: 'PATCH' });
    });

    it('sends nothing when the name is cancelled, blank or unchanged', async () => {
      await create();
      const rename = vi.spyOn(store, 'updateSection');

      for (const [value, key] of [['Autre', 'Escape'], ['   ', 'Enter'], ['Produits frais', 'Enter']] as const) {
        title().click();
        await render();
        await type(value, key);
        expect(nameInput()).toBeNull();
      }
      nameInput()?.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));

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

  it('turns line breaks typed or pasted into a new item into spaces', async () => {
    await create();

    component.beginAdding('fresh');
    component.newEntryValue.set('Beurre\n\n  doux \r\n demi-sel\n');
    component.finishAdding('fresh');

    const request = http.expectOne('/api/v1/lists/list-1/sections/fresh/entries');
    expect(request.request.body).toEqual({ name: 'Beurre doux demi-sel' });
    request.flush(entry('butter', 'Beurre doux demi-sel'));
  });

  it('focuses the new entry input, named for screen readers, when it appears', async () => {
    await create();

    component.beginAdding('fresh');
    await render();

    const input = element.querySelector('.new-entry-input') as HTMLTextAreaElement;
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute('aria-label')).toBe('Nouvel élément');
    // A textarea, so long text wraps like the items instead of scrolling sideways.
    expect(input.tagName).toBe('TEXTAREA');
    expect(input.rows).toBe(1);
    expect(input.hasAttribute('appAutoGrow')).toBe(true);
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

      expect(component.dragged()).toBeNull();
      http.expectNone('/api/v1/lists/list-1/sections/fresh/order');
    });

    /** A detached section block, as `elementFromPoint` would find under the pointer. */
    function block(sectionId: string): HTMLElement {
      const target = document.createElement('div');
      target.className = 'section-block';
      target.dataset['sectionId'] = sectionId;
      return target;
    }
    const sectionIds = () => component.list()!.sections.map(({ id }) => id);

    it('moves a section over another one and saves the section order once on drop', async () => {
      await create();
      const pointFinder = vi.spyOn(document, 'elementFromPoint').mockReturnValue(block('grocery'));

      component.startSectionDrag('fresh');
      component.moveDrag(pointer());
      fixture.detectChanges();
      expect(sectionIds()).toEqual(['grocery', 'fresh']);
      expect(element.querySelector('.section-block.dragging')?.getAttribute('data-section-id')).toBe('fresh');
      // Hovering the dragged section itself changes nothing.
      pointFinder.mockReturnValue(block('fresh'));
      component.moveDrag(pointer());
      expect(sectionIds()).toEqual(['grocery', 'fresh']);

      component.endDrag();
      const order = http.expectOne({ method: 'PUT', url: '/api/v1/lists/list-1/sections/order' });
      expect(order.request.body).toEqual({ sectionIds: ['grocery', 'fresh'] });
      order.flush(null);
      expect(component.draggedSection()).toBeNull();
      // A section drag never reorders entries.
      http.expectNone('/api/v1/lists/list-1/sections/fresh/order');
    });

    it('saves no section order when the drag moved nothing', async () => {
      await create();

      component.startSectionDrag('fresh');
      component.endDrag();

      http.expectNone('/api/v1/lists/list-1/sections/order');
      expect(component.draggedSection()).toBeNull();
    });

    it('drags a collapsed section from its own handle', async () => {
      await create();
      component.toggleSection('fresh');
      await render();
      const handle = element.querySelector('.section-handle') as HTMLButtonElement;
      expect(handle.getAttribute('aria-label')).toBe('Déplacer la section Produits frais');
      const setPointerCapture = vi.fn();
      const start = {
        pointerId: 3,
        currentTarget: { setPointerCapture },
        preventDefault: vi.fn(),
      } as unknown as PointerEvent;

      component.startSectionDrag('fresh', start);

      expect(setPointerCapture).toHaveBeenCalledTimes(1);
      expect(setPointerCapture).toHaveBeenCalledWith(3);
      expect(component.draggedSection()).toBe('fresh');
      component.endDrag();
    });
  });

  describe('home page', () => {
    it('lets the owner pin the list from the more-options menu, and unpin it', async () => {
      await create();
      (element.querySelector('.more-button') as HTMLButtonElement).click();
      await render();
      const items = Array.from(element.querySelectorAll<HTMLButtonElement>('.list-menu button'));
      // New sections have their own button under the sections.
      expect(items.map((item) => item.textContent?.trim())).toEqual([
        '✎ Modifier la liste',
        '⌂ Afficher sur l’accueil',
      ]);

      items[1].click();
      const pin = http.expectOne('/api/v1/lists/list-1/preferences');
      expect(pin.request.body).toEqual({ onHome: true });
      pin.flush(null, { status: 204, statusText: 'No Content' });
      await render();
      expect(element.querySelector('.list-menu')).toBeNull();

      (element.querySelector('.more-button') as HTMLButtonElement).click();
      await render();
      const toggle = element.querySelector('.home-toggle') as HTMLButtonElement;
      expect(toggle.textContent).toContain('Retirer de l’accueil');
      expect(toggle.getAttribute('aria-pressed')).toBe('true');
      toggle.click();
      const unpin = http.expectOne('/api/v1/lists/list-1/preferences');
      expect(unpin.request.body).toEqual({ onHome: false });
      unpin.flush(null, { status: 204, statusText: 'No Content' });
      await render();
      expect(store.detail()?.onHome).toBe(false);
    });

    it('gives viewers the pin as their only action, as its own button', async () => {
      await create({ detail: listDetail({ role: 'viewer', ownership: 'shared' }) });

      expect(element.querySelector('.more-button')).toBeNull();
      const pin = element.querySelector('.home-pin') as HTMLButtonElement;
      expect(pin.getAttribute('aria-label')).toBe('Afficher sur l’accueil');
      expect(pin.getAttribute('aria-pressed')).toBe('false');

      pin.click();
      http.expectOne('/api/v1/lists/list-1/preferences').flush(null, { status: 204, statusText: 'No Content' });
      await render();

      expect(pin.getAttribute('aria-label')).toBe('Retirer de l’accueil');
      expect(pin.getAttribute('aria-pressed')).toBe('true');
      expect(pin.classList).toContain('active');
    });
  });

  it('gives editors the pin as their only list action, and a button to add sections', async () => {
    await create({ detail: listDetail({ role: 'editor', ownership: 'shared' }) });

    expect(element.querySelector('.more-button')).toBeNull();
    expect(element.querySelector('.home-pin')).not.toBeNull();
    const add = element.querySelector('.new-section-button') as HTMLButtonElement;
    expect(add.textContent).toContain('Nouvelle section');

    add.click();
    await render();
    expect(component.sectionCreatorOpen()).toBe(true);
    expect(element.querySelector('app-list-section-creator')).not.toBeNull();
  });

  it('lets viewers read the list without editing controls', async () => {
    await create({ detail: listDetail({ role: 'viewer', ownership: 'shared' }) });

    expect(element.querySelector('.more-button')).toBeNull();
    expect(element.querySelector('.empty-entry')).toBeNull();
    expect(element.querySelector('.new-section-button')).toBeNull();
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
    expect(element.querySelector('.section-handle')).toBeNull();
  });

  it('explains when the list cannot be opened', async () => {
    await create({ detail: null });

    expect(element.querySelector('[role="alert"]')?.textContent).toContain('n’existe pas');
    // The page says it once: no toast repeats it over the tab bar.
    expect(element.querySelector('app-toast')?.textContent?.trim()).toBe('');
  });

  describe('owner actions', () => {
    describe('renaming from the title', () => {
      const titleButton = () => element.querySelector('.list-title button') as HTMLButtonElement | null;
      const titleInput = () => element.querySelector('.list-title input') as HTMLInputElement | null;

      async function startRenaming(): Promise<HTMLInputElement> {
        // In the document, so the field can take the focus.
        document.body.append(element);
        onTestFinished(() => element.remove());
        titleButton()!.click();
        await render();
        return titleInput()!;
      }

      it('turns the title into a field holding the name, focused and selected', async () => {
        await create();
        expect(titleButton()?.getAttribute('aria-label')).toBe('Renommer la liste Courses');

        const input = await startRenaming();

        expect(input.value).toBe('Courses');
        expect(document.activeElement).toBe(input);
        expect([input.selectionStart, input.selectionEnd]).toEqual([0, 'Courses'.length]);
        // Still the page heading, and nothing opened the settings panel.
        expect(input.closest('h1')).not.toBeNull();
        expect(element.querySelector('app-list-editor')).toBeNull();
      });

      it('saves the trimmed name on Enter, once, and shows it', async () => {
        await create();
        const input = await startRenaming();
        input.value = '  Courses du samedi ';
        input.dispatchEvent(new Event('input'));

        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        await render();
        const save = http.expectOne({ method: 'PATCH', url: '/api/v1/lists/list-1' });
        expect(save.request.body).toEqual({ name: 'Courses du samedi' });
        save.flush(listDetail({ name: 'Courses du samedi' }));
        await render();

        // Removing the field blurred it: no second request.
        http.expectNone({ method: 'PATCH' });
        expect(titleInput()).toBeNull();
        expect(titleButton()?.textContent).toBe('Courses du samedi');
      });

      it('saves when the field is left', async () => {
        await create();
        const input = await startRenaming();
        input.value = 'Marché';
        input.dispatchEvent(new Event('input'));

        input.blur();
        await render();

        const save = http.expectOne({ method: 'PATCH', url: '/api/v1/lists/list-1' });
        expect(save.request.body).toEqual({ name: 'Marché' });
        save.flush(listDetail({ name: 'Marché' }));
      });

      it('sends nothing on Escape, for a blank name or an unchanged one', async () => {
        await create();
        for (const [value, key] of [['Marché', 'Escape'], ['   ', 'Enter'], [' Courses ', 'Enter']]) {
          const input = await startRenaming();
          input.value = value;
          input.dispatchEvent(new Event('input'));
          input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
          await render();
          expect(titleInput()).toBeNull();
        }

        http.expectNone({ method: 'PATCH' });
        expect(titleButton()?.textContent).toBe('Courses');
      });

      it('leaves the title as plain text for editors and viewers', async () => {
        await create({ detail: listDetail({ role: 'editor', ownership: 'shared' }) });

        expect(titleButton()).toBeNull();
        expect(element.querySelector('.list-title')?.textContent?.trim()).toBe('Courses');
        component.startRenaming();
        await render();
        expect(titleInput()).toBeNull();
      });
    });

    it('opens the editor of a freshly created list', async () => {
      await create({ query: { edit: '1' } });

      expect(element.querySelector('app-list-editor')).not.toBeNull();
    });

    it('saves the editor drafts before inviting, then comes back to the editor', async () => {
      await create({ query: { edit: '1' } });
      const editor = () => element.querySelector('app-list-editor');
      const nameField = editor()!.querySelector('input[type="text"]') as HTMLInputElement;
      nameField.value = 'Courses du samedi';
      nameField.dispatchEvent(new Event('input'));

      (editor()!.querySelector('.sharing-row button') as HTMLButtonElement).click();
      const save = http.expectOne({ method: 'PATCH', url: '/api/v1/lists/list-1' });
      expect(save.request.body).toEqual(expect.objectContaining({ name: 'Courses du samedi' }));
      save.flush(listDetail({ name: 'Courses du samedi' }));
      await render();

      expect(editor()).toBeNull();
      expect(element.querySelector('app-list-sharing-panel')).not.toBeNull();
      expect(element.querySelector('.list-title')?.textContent).toBe('Courses du samedi');

      component.closeSharing();
      await render();
      expect(element.querySelector('app-list-sharing-panel')).toBeNull();
      expect((editor()!.querySelector('input[type="text"]') as HTMLInputElement).value).toBe('Courses du samedi');

      // Closing the sharing panel opened from the header does not open the editor.
      component.listEditorOpen.set(false);
      component.sharingOpen.set(true);
      component.closeSharing();
      await render();
      expect(editor()).toBeNull();
    });

    it('stays in the editor when saving its drafts before inviting fails', async () => {
      await create({ query: { edit: '1' } });

      const inviting = component.openSharingFromEditor({ name: 'X', icon: 'cart', color: '#2ecb70', description: '', removeChecked: false });
      http.expectOne({ method: 'PATCH', url: '/api/v1/lists/list-1' }).flush(null, { status: 500, statusText: 'Error' });
      await inviting;
      await render();

      expect(component.listEditorOpen()).toBe(true);
      expect(component.sharingOpen()).toBe(false);
    });

    it('saves the editor and deletes the list', async () => {
      await create();
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      component.toggleListMenu();
      component.openListEditor();
      await render();

      const edits = { name: 'Courses du samedi', icon: 'gift' as const, color: '#e65591', description: 'Samedi', removeChecked: true };
      const saving = component.saveList(edits);
      const update = http.expectOne({ method: 'PATCH', url: '/api/v1/lists/list-1' });
      expect(update.request.body).toEqual(edits);
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
