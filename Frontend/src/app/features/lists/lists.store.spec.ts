import { TestBed } from '@angular/core/testing';
import { createMockPlanoData } from '@plano/common';
import {
  MemoryPlanoDataAdapter,
  PLANO_DATA_ADAPTER,
} from '../../core/data/plano-data.adapter';
import { PlanoDataStore } from '../../core/data/plano-data.store';
import { APP_CLOCK } from '../../core/time/dates';
import { ListsStore } from './lists.store';

describe('ListsStore persistence', () => {
  it('hydrates from and saves through the configured adapter', () => {
    const adapter = new MemoryPlanoDataAdapter();
    const saved = createMockPlanoData();
    saved.lists[0].name = 'Courses persistées';
    adapter.save(saved);
    TestBed.configureTestingModule({
      providers: [{ provide: PLANO_DATA_ADAPTER, useValue: adapter }],
    });
    const store = TestBed.inject(ListsStore);

    expect(store.list('courses')?.name).toBe('Courses persistées');

    store.updateSettings({ defaultView: 'grid' });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PlanoDataStore,
        ListsStore,
        { provide: PLANO_DATA_ADAPTER, useValue: adapter },
      ],
    });

    expect(TestBed.inject(ListsStore).settings().defaultView).toBe('grid');
  });
});

describe('ListsStore detail', () => {
  let store: ListsStore;
  const names = (sectionId: string) =>
    store.detail('courses')?.sections.find(({ id }) => id === sectionId)?.entries.map(({ name }) => name);
  const entry = (sectionId: string, entryId: string) =>
    store.detail('courses')?.sections.find(({ id }) => id === sectionId)?.entries.find(({ id }) => id === entryId);

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: APP_CLOCK, useValue: () => new Date(2026, 9, 15, 9, 5) }],
    });
    store = TestBed.inject(ListsStore);
  });

  it('derives the overview counts from the entries on every change', () => {
    expect(store.list('courses')).toEqual(jasmine.objectContaining({ completed: 3, total: 12 }));

    store.toggleEntry('courses', 'fresh', 'milk');
    store.removeEntry('courses', 'drinks', 'water');

    expect(store.list('courses')).toEqual(jasmine.objectContaining({ completed: 4, total: 11 }));
  });

  it('adds an entry stamped with its author and the current time', () => {
    store.addEntry('courses', 'fresh', 'Beurre', 'Ada');

    const added = store.detail('courses')!.sections[0].entries.at(-1)!;
    expect(added).toEqual(jasmine.objectContaining({
      name: 'Beurre',
      done: false,
      addedBy: 'Ada',
      addedAt: '15 octobre 2026 à 09:05',
      assignedTo: '',
    }));
  });

  it('updates, moves and removes entries by id', () => {
    store.updateEntry('courses', 'fresh', 'milk', { notes: 'Demi-écrémé', assignedTo: 'Sam' });
    expect(entry('fresh', 'milk')).toEqual(jasmine.objectContaining({ notes: 'Demi-écrémé', assignedTo: 'Sam' }));

    store.moveEntry('courses', 'fresh', 'milk', 'salad');
    expect(names('fresh')).toEqual(['Œufs', 'Tomates', 'Salade', 'Lait']);
    store.moveEntry('courses', 'fresh', 'milk', 'unknown');
    expect(names('fresh')).toEqual(['Œufs', 'Tomates', 'Salade', 'Lait']);

    store.removeEntry('courses', 'fresh', 'milk');
    expect(names('fresh')).toEqual(['Œufs', 'Tomates', 'Salade']);
  });

  it('adds sections and edits the description', () => {
    store.addSection('courses', 'Surgelés', '#3978ed');
    store.updateDescription('courses', 'Pour samedi');

    expect(store.detail('courses')?.sections.at(-1)).toEqual(
      jasmine.objectContaining({ name: 'Surgelés', color: '#3978ed', entries: [] }),
    );
    expect(store.detail('courses')?.description).toBe('Pour samedi');
  });

  it('invites members with a name guessed from the address', () => {
    store.inviteMember('courses', '  ', 'editor');
    expect(store.detail('courses')?.members.length).toBe(3);

    store.inviteMember('courses', 'marie.dupont@example.com', 'viewer');
    store.inviteMember('courses', '@example.com', 'editor');

    const members = store.detail('courses')!.members;
    expect(members.at(-2)).toEqual(jasmine.objectContaining({ name: 'Marie Dupont', initials: 'M', role: 'viewer' }));
    expect(members.at(-1)?.name).toBe('@example.com');
  });

  it('changes roles except the owner’s, and stopping sharing keeps only the owner', () => {
    store.updateMemberRole('courses', 'alex', 'viewer');
    store.updateMemberRole('courses', 'camille', 'viewer');
    expect(store.detail('courses')?.members.map(({ role }) => role)).toEqual(['owner', 'viewer', 'viewer']);

    store.setSharing('courses', false);
    expect(store.detail('courses')).toEqual(jasmine.objectContaining({ sharingEnabled: false }));
    expect(store.detail('courses')?.members.map(({ id }) => id)).toEqual(['camille']);

    store.setSharing('courses', true);
    expect(store.detail('courses')?.sharingEnabled).toBeTrue();
  });

  it('ignores changes to an unknown list', () => {
    const before = store.lists();
    store.addSection('missing', 'Section', '#000');
    expect(store.lists()).toEqual(before);
    expect(store.detail('missing')).toBeUndefined();
  });
});
