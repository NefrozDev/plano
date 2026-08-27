import { TestBed } from '@angular/core/testing';
import { createMockPlanoData } from '@plano/common';
import {
  MemoryPlanoDataAdapter,
  PLANO_DATA_ADAPTER,
} from '../../core/data/plano-data.adapter';
import { PlanoDataStore } from '../../core/data/plano-data.store';
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

  it('keeps list summary counts in sync with persisted detail', () => {
    const store = TestBed.inject(ListsStore);
    const detail = store.detail('courses');
    expect(detail).toBeDefined();

    const sections = structuredClone(detail!.sections);
    sections[0].entries[0].done = true;
    store.updateDetail('courses', { sections, total: 12 });

    expect(store.list('courses')).toEqual(
      jasmine.objectContaining({ completed: 4, total: 12 }),
    );
  });
});
