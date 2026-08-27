import { convertToParamMap } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { ListDetailComponent } from './list-detail.component';
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
});
