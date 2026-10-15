import { convertToParamMap } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { ListDetailComponent } from './list-detail.component';
import { ConfirmService } from '../../../shared/ui/confirm.service';
import { ListsStore } from '../lists.store';

describe('ListDetailComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ListDetailComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ slug: 'courses' }) } },
        },
      ],
    }).compileComponents();
  });

  it('renders the expanded list and toggles its entries', () => {
    const fixture = TestBed.createComponent(ListDetailComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.list-title')?.textContent).toContain('Courses');
    expect(element.querySelectorAll('.entry').length).toBe(12);
    expect(component.completed()).toBe(3);
    const firstSection = element.querySelector('.entry-section') as HTMLElement;
    expect(firstSection.style.getPropertyValue('--section-progress')).toBe('25%');
    component.toggleEntry(0, 0);
    fixture.detectChanges();
    expect(component.completed()).toBe(4);
    expect(firstSection.style.getPropertyValue('--section-progress')).toBe('50%');
  });

  it('collapses only the selected subsection when its title is clicked', () => {
    const fixture = TestBed.createComponent(ListDetailComponent);
    fixture.detectChanges();
    const sectionTitle = (fixture.nativeElement as HTMLElement).querySelector(
      '.section-title',
    ) as HTMLButtonElement;

    sectionTitle.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.isSectionCollapsed('Produits frais')).toBeTrue();
    expect(fixture.componentInstance.isSectionCollapsed('Épicerie')).toBeFalse();
    expect(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.section-summary')
        .length,
    ).toBe(1);
    expect(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.entry').length,
    ).toBe(8);
    expect(
      ((fixture.nativeElement as HTMLElement).querySelector(
        '.section-summary',
      ) as HTMLElement).style.getPropertyValue('--section-progress'),
    ).toBe('25%');
  });

  it('automatically collapses a subsection when it reaches 100%', () => {
    const fixture = TestBed.createComponent(ListDetailComponent);
    const component = fixture.componentInstance;

    component.toggleEntry(0, 0);
    component.toggleEntry(0, 2);
    component.toggleEntry(0, 3);
    fixture.detectChanges();

    expect(component.sectionCompleted(component.sections()[0])).toBe(4);
    expect(component.isSectionCollapsed('Produits frais')).toBeTrue();
    const summary = (fixture.nativeElement as HTMLElement).querySelector(
      '.section-summary',
    ) as HTMLElement;
    expect(summary.textContent).toContain('4 / 4');
    expect(summary.style.getPropertyValue('--section-progress')).toBe('100%');
  });

  it('reorders entries from their drag handles', () => {
    const component = TestBed.createComponent(ListDetailComponent).componentInstance;

    component.reorderEntry(0, 0, 3);

    expect(component.sections()[0].entries.map((entry) => entry.name)).toEqual([
      'Œufs',
      'Tomates',
      'Salade',
      'Lait',
    ]);
  });

  it('does not select UI text but keeps editor text selectable', () => {
    const fixture = TestBed.createComponent(ListDetailComponent);
    fixture.detectChanges();
    const sectionTitle = (fixture.nativeElement as HTMLElement).querySelector(
      '.section-title',
    ) as HTMLElement;

    expect(getComputedStyle(sectionTitle).userSelect).toBe('none');

    fixture.componentInstance.openListEditor();
    fixture.detectChanges();
    const editor = (fixture.nativeElement as HTMLElement).querySelector(
      '.editor-field input',
    ) as HTMLInputElement;
    expect(getComputedStyle(editor).userSelect).toBe('text');
  });

  it('adds an entry from a sub-list empty row and ignores blank values', () => {
    const component = TestBed.createComponent(ListDetailComponent).componentInstance;
    const initialLength = component.sections()[0].entries.length;

    component.beginAdding(0);
    component.finishAdding(0);
    expect(component.sections()[0].entries.length).toBe(initialLength);

    component.beginAdding(0);
    component.newEntryValue.set('  Beurre  ');
    component.finishAdding(0);
    expect(component.sections()[0].entries.at(-1)?.name).toBe('Beurre');
    expect(component.total()).toBe(9);
  });

  it('opens entry details from the row without toggling completion', () => {
    const fixture = TestBed.createComponent(ListDetailComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const initialDone = component.sections()[0].entries[0].done;
    const row = (fixture.nativeElement as HTMLElement).querySelector('.entry') as HTMLElement;

    row.click();
    fixture.detectChanges();

    expect(component.sections()[0].entries[0].done).toBe(initialDone);
    expect(component.selectedEntry()).toEqual({ sectionIndex: 0, entryIndex: 0 });
    expect((fixture.nativeElement as HTMLElement).querySelector('.entry-details')).not.toBeNull();
  });

  it('toggles completion only from the left circle', () => {
    const fixture = TestBed.createComponent(ListDetailComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const toggle = (fixture.nativeElement as HTMLElement).querySelector('.entry-toggle') as HTMLButtonElement;

    toggle.click();

    expect(component.sections()[0].entries[0].done).toBeTrue();
    expect(component.selectedEntry()).toBeNull();
  });

  it('stores entry details and creates a new colored section', () => {
    const component = TestBed.createComponent(ListDetailComponent).componentInstance;

    component.selectedEntry.set({ sectionIndex: 0, entryIndex: 0 });
    component.updateSelectedEntry({ assignedTo: 'Sam', notes: 'Prendre du demi-écrémé' });
    component.newSectionName.set('Surgelés');
    component.newSectionColor.set('#3978ed');
    component.saveSection();

    expect(component.sections()[0].entries[0].assignedTo).toBe('Sam');
    expect(component.sections()[0].entries[0].notes).toBe('Prendre du demi-écrémé');
    expect(component.sections().at(-1)).toEqual(
      jasmine.objectContaining({ name: 'Surgelés', color: '#3978ed', entries: [] }),
    );
  });

  it('permanently deletes an entry and updates the total', () => {
    const component = TestBed.createComponent(ListDetailComponent).componentInstance;

    component.deleteEntry(0, 0);

    expect(component.sections()[0].entries.map((entry) => entry.name)).not.toContain(
      'Lait',
    );
    expect(component.total()).toBe(7);
  });

  it('closes a revealed delete action without toggling the entry', () => {
    const component = TestBed.createComponent(ListDetailComponent).componentInstance;
    const initialDone = component.sections()[0].entries[0].done;
    const event = new MouseEvent('click', { cancelable: true });
    component.revealedEntry.set({ sectionIndex: 0, entryIndex: 0 });

    component.handleEntryClick(event, 0, 0);

    expect(event.defaultPrevented).toBeTrue();
    expect(component.revealedEntry()).toBeNull();
    expect(component.sections()[0].entries[0].done).toBe(initialDone);
  });

  it('permanently deletes an entry when a left swipe crosses the threshold', () => {
    const component = TestBed.createComponent(ListDetailComponent).componentInstance;
    TestBed.inject(ListsStore).updateSettings({ confirmDelete: false });
    component.swipeGesture.set({
      sectionIndex: 0,
      entryIndex: 0,
      startX: 100,
      currentX: 55,
    });

    component.finishSwipe();

    expect(component.sections()[0].entries.map((entry) => entry.name)).not.toContain(
      'Lait',
    );
    expect(component.swipeGesture()).toBeNull();
  });

  it('opens the list editor from the overflow menu and saves its name', () => {
    const fixture = TestBed.createComponent(ListDetailComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    component.toggleListMenu();
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).textContent,
    ).toContain('Modifier la liste');

    component.openListEditor();
    component.draftName.set('Courses du week-end');
    component.saveListEditor();
    fixture.detectChanges();

    expect(component.title()).toBe('Courses du week-end');
    expect(component.listEditorOpen()).toBeFalse();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.list-title')
        ?.textContent,
    ).toContain('Courses du week-end');
  });

  it('saves the selected main-menu icon for the lists overview', () => {
    const component = TestBed.createComponent(ListDetailComponent).componentInstance;
    const listsStore = TestBed.inject(ListsStore);

    component.selectedIcon.set('gift');
    component.saveListEditor();

    expect(listsStore.list('courses')?.icon).toBe('gift');
  });

  it('opens sharing and stores member permissions', () => {
    const fixture = TestBed.createComponent(ListDetailComponent);
    const component = fixture.componentInstance;

    component.openSharing();
    component.updateMemberRole('alex', 'viewer');
    component.inviteEmail.set('marie@example.com');
    component.inviteRole.set('editor');
    component.inviteMember();
    fixture.detectChanges();

    expect(component.members().find((member) => member.id === 'alex')?.role).toBe('viewer');
    expect(component.members().at(-1)).toEqual(
      jasmine.objectContaining({ name: 'Marie', role: 'editor' }),
    );
    expect((fixture.nativeElement as HTMLElement).querySelector('.sharing-panel')).not.toBeNull();
  });

  it('stops sharing while retaining the owner', () => {
    const component = TestBed.createComponent(ListDetailComponent).componentInstance;

    component.stopSharing();

    expect(component.sharingEnabled()).toBeFalse();
    expect(component.members().map((member) => member.role)).toEqual(['owner']);
  });

  describe('gestures', () => {
    let component: ListDetailComponent;

    /** Minimal PointerEvent: only what the handlers read. */
    function pointer(clientX = 0, target: HTMLElement = document.createElement('div')): PointerEvent {
      return {
        clientX,
        clientY: 0,
        pointerId: 1,
        target,
        currentTarget: { setPointerCapture: jasmine.createSpy('setPointerCapture') },
        preventDefault: jasmine.createSpy('preventDefault'),
        stopPropagation: jasmine.createSpy('stopPropagation'),
      } as unknown as PointerEvent;
    }

    /** A detached `.entry` row, as `elementFromPoint` would return under the pointer. */
    function entryRow(sectionIndex: number, entryIndex: number): HTMLElement {
      const row = document.createElement('div');
      row.className = 'entry';
      row.dataset['sectionIndex'] = `${sectionIndex}`;
      row.dataset['entryIndex'] = `${entryIndex}`;
      return row;
    }

    beforeEach(() => {
      component = TestBed.createComponent(ListDetailComponent).componentInstance;
    });

    it('drags an entry over another row of the same section', () => {
      const pointFinder = spyOn(document, 'elementFromPoint').and.returnValue(entryRow(0, 2));

      component.movePointerDrag(pointer());
      expect(pointFinder).not.toHaveBeenCalled();

      component.startPointerDrag(0, 0, pointer());
      component.movePointerDrag(pointer());
      expect(component.sections()[0].entries[2].name).toBe('Lait');
      expect(component.draggedEntry()).toEqual({ sectionIndex: 0, entryIndex: 2 });

      // Rows of other sections, the same row, or empty space are ignored.
      pointFinder.and.returnValue(entryRow(1, 0));
      component.movePointerDrag(pointer());
      pointFinder.and.returnValue(entryRow(0, 2));
      component.movePointerDrag(pointer());
      pointFinder.and.returnValue(null);
      component.movePointerDrag(pointer());
      expect(component.sections()[0].entries[2].name).toBe('Lait');

      component.finishPointerDrag(pointer());
      expect(component.draggedEntry()).toBeNull();
    });

    it('reveals the swipe offset while dragging left and clamps it', () => {
      component.startSwipe(0, 1, pointer(200));
      component.moveSwipe(pointer(190));
      expect(component.swipeOffset(0, 1)).toBe(-10);
      component.moveSwipe(pointer(50));
      expect(component.swipeOffset(0, 1)).toBe(-58);
      expect(component.swipeOffset(0, 0)).toBe(0);

      // A short swipe is cancelled but swallows the click that follows.
      component.moveSwipe(pointer(180));
      component.finishSwipe();
      expect(component.swipeGesture()).toBeNull();
      const click = new MouseEvent('click', { cancelable: true });
      component.handleEntryClick(click, 0, 1);
      expect(click.defaultPrevented).toBeTrue();
      expect(component.selectedEntry()).toBeNull();
    });

    it('ignores swipes starting on the handle or the toggle', () => {
      const handle = document.createElement('button');
      handle.className = 'drag-handle';
      component.startSwipe(0, 0, pointer(100, handle));
      component.moveSwipe(pointer(10));
      component.finishSwipe();

      expect(component.swipeGesture()).toBeNull();
      expect(component.sections()[0].entries.length).toBe(4);
    });

    it('keeps a revealed row open offset and swallows its next click', () => {
      component.revealedEntry.set({ sectionIndex: 0, entryIndex: 0 });
      expect(component.swipeOffset(0, 0)).toBe(-58);

      component.startSwipe(0, 0, pointer(100));
      expect(component.suppressEntryClick()).toEqual({ sectionIndex: 0, entryIndex: 0 });
      component.finishSwipe();
      expect(component.revealedEntry()).toBeNull();
    });

    it('asks before deleting when confirmation is enabled', async () => {
      const confirm = spyOn(TestBed.inject(ConfirmService), 'ask').and.resolveTo(false);
      await component.requestDeleteEntry(0, 0);
      expect(confirm).toHaveBeenCalledWith(jasmine.objectContaining({ message: jasmine.stringContaining('Lait') }));
      expect(component.sections()[0].entries.length).toBe(4);

      confirm.and.resolveTo(true);
      await component.requestDeleteEntry(0, 0);
      expect(component.sections()[0].entries.length).toBe(3);

      await component.requestDeleteEntry(0, 99);
      expect(confirm).toHaveBeenCalledTimes(2);
    });
  });

  describe('panels and editors', () => {
    let component: ListDetailComponent;

    beforeEach(() => {
      component = TestBed.createComponent(ListDetailComponent).componentInstance;
    });

    it('opens and closes the section creator, refusing blank names', () => {
      component.toggleListMenu();
      component.openSectionCreator();
      expect(component.listMenuOpen()).toBeFalse();
      expect(component.sectionCreatorOpen()).toBeTrue();

      component.newSectionName.set('   ');
      component.saveSection();
      expect(component.sections().length).toBe(4);

      component.closeSectionCreator();
      expect(component.sectionCreatorOpen()).toBeFalse();
    });

    it('discards list editor changes on cancel', () => {
      component.openListEditor();
      component.draftName.set('Brouillon');
      component.closeListEditor();

      expect(component.draftName()).toBe('Courses');
      expect(component.listEditorOpen()).toBeFalse();
    });

    it('keeps the previous name when saving a blank one', () => {
      component.openListEditor();
      component.draftName.set('   ');
      component.saveListEditor();

      expect(component.title()).toBe('Courses');
    });

    it('manages invitations, roles and the share link', async () => {
      component.openSharing();
      component.inviteEmail.set('  ');
      component.inviteMember();
      expect(component.members().length).toBe(3);

      component.inviteEmail.set('@example.com');
      component.inviteMember();
      expect(component.members().at(-1)?.name).toBe('@example.com');

      component.updateMemberRole('camille', 'viewer');
      expect(component.members()[0].role).toBe('owner');
      expect(component.roleLabel('owner')).toBe('Propriétaire');
      expect(component.roleLabel('editor')).toBe('Peut modifier');
      expect(component.roleLabel('viewer')).toBe('Peut consulter');

      const writeText = spyOn(navigator.clipboard, 'writeText').and.resolveTo();
      await component.copyInvitationLink();
      expect(writeText).toHaveBeenCalledWith('https://plano.app/l/courses-a1b2c3');
      expect(component.linkCopied()).toBeTrue();

      component.stopSharing();
      component.enableSharing();
      expect(component.sharingEnabled()).toBeTrue();
      component.closeSharing();
      expect(component.sharingOpen()).toBeFalse();
    });

    it('edits the selected entry and closes its details', () => {
      component.updateSelectedEntry({ notes: 'ignoré' });
      expect(component.activeEntry()).toBeNull();
      expect(component.activeEntrySection()).toBeNull();

      component.selectedEntry.set({ sectionIndex: 1, entryIndex: 2 });
      expect(component.activeEntry()?.name).toBe('Huile d’olive');
      expect(component.activeEntrySection()?.name).toBe('Épicerie');

      component.closeEntryDetails();
      expect(component.selectedEntry()).toBeNull();
    });

    it('cancels adding and ignores stale blur events from other sections', () => {
      component.beginAdding(1);
      component.newEntryValue.set('Farine');
      component.finishAdding(0);
      expect(component.editingSection()).toBe(1);

      component.cancelAdding();
      expect(component.editingSection()).toBeNull();
      expect(component.newEntryValue()).toBe('');
    });

    it('reopens a collapsed section', () => {
      component.toggleSection('Boissons');
      component.toggleSection('Boissons');
      expect(component.isSectionCollapsed('Boissons')).toBeFalse();
    });
  });

  it('applies the hide-completed and keep-order display settings', () => {
    const component = TestBed.createComponent(ListDetailComponent).componentInstance;
    const listsStore = TestBed.inject(ListsStore);
    const section = component.sections()[0];

    // Default: completed entries are shown, sorted last.
    expect(component.displayedEntries(section).at(-1)?.entry.name).toBe('Œufs');

    listsStore.updateSettings({ completedLast: false });
    expect(component.displayedEntries(section)[1].entry.name).toBe('Œufs');

    listsStore.updateSettings({ showCompleted: false });
    expect(component.displayedEntries(section).map(({ entry }) => entry.name)).not.toContain('Œufs');
    expect(component.sectionProgress({ ...section, entries: [] })).toBe(0);
  });
});
