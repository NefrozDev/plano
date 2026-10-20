import { TestBed } from '@angular/core/testing';
import type { AgendaEvent } from '@plano/common';
import { MemoryPlanoDataAdapter, PLANO_DATA_ADAPTER } from '../../core/data/plano-data.adapter';
import { flushListReminders, providePlanoTesting, settle } from '../../testing/plano-testing';
import { AgendaEventDraft, AgendaStore } from './agenda.store';

describe('AgendaStore', () => {
  let store: AgendaStore;
  const titles = (date: string): string[] => store.itemsOn(date).map((item) => item.title);

  function draft(changes: Partial<AgendaEventDraft> = {}): AgendaEventDraft {
    const { id: _id, ...base } = store.event('dejeuner') as AgendaEvent;
    return { ...base, ...changes };
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: providePlanoTesting() });
    store = TestBed.inject(AgendaStore);
    store.loadTasks();
    flushListReminders();
    await settle();
  });

  describe('items', () => {
    it('lists the day in time order, mixing events and dated list tasks', () => {
      expect(titles('2026-10-15')).toEqual([
        'Rendez-vous projet', 'Courses', 'Déjeuner', 'Appel avec Camille', 'Sport', 'Lait', 'Restaurant',
      ]);
      const task = store.itemsOn('2026-10-15').find((item) => item.kind === 'task');
      expect(task).toEqual(
        expect.objectContaining({ subtitle: 'Liste · Courses', link: ['/lists', 'courses'] }),
      );
    });

    it('shows planned objective sessions as all-day tasks, first', () => {
      expect(titles('2026-10-17')).toEqual(['Sortie 7 km', 'Cinéma']);
      expect(store.itemsOn('2026-10-17')[0].link).toEqual(['/objectives', 'courir-10-km', 'calendar']);
    });

    it('applies calendar and display filters', () => {
      store.toggleCalendar('travail');
      expect(titles('2026-10-15')).not.toContain('Rendez-vous projet');
      expect(store.activeFilterCount()).toBe(1);
      store.toggleCalendar('travail');

      store.updateFilters({ showTasks: false });
      expect(titles('2026-10-15')).not.toContain('Lait');

      store.updateFilters({ showEvents: false, showTasks: true });
      expect(titles('2026-10-15')).toEqual(['Lait']);

      store.resetFilters();
      expect(store.activeFilterCount()).toBe(0);
    });

    it('hides finished events when asked to', () => {
      expect(titles('2026-10-09')).toEqual(['Dentiste']);
      store.updateFilters({ showPastEvents: false });
      expect(titles('2026-10-09')).toEqual([]);
      // 09:00–10:30 ends exactly "now" (10:30): still shown.
      expect(titles('2026-10-15')).toContain('Rendez-vous projet');
    });
  });

  it('searches titles, places, calendars and participants without accents', () => {
    expect(store.search('camille').map((event) => event.id)).toEqual([
      'rendez-vous-projet', 'appel-camille', 'restaurant', 'anniversaire-camille',
    ]);
    expect(store.search('carrefour').map((event) => event.id)).toEqual(['courses']);
    expect(store.search('travail').length).toBe(4);
    // Matches the "Salle de réunion" location as well as the title.
    expect(store.search('reunion').map((event) => event.id)).toEqual(['rendez-vous-projet', 'reunion-equipe']);
    expect(store.search('  ')).toEqual([]);
  });

  describe('mutations', () => {
    it('creates an event and fixes a non-positive duration with the default one', () => {
      const created = store.create(draft({ title: '  Café  ', start: '2026-10-16T08:00', end: '2026-10-16T07:00' }));

      expect(created).toEqual(expect.objectContaining({ title: 'Café', end: '2026-10-16T09:00' }));
      expect(titles('2026-10-16')).toContain('Café');
    });

    it('stretches all-day events over whole days', () => {
      const created = store.create(
        draft({ allDay: true, start: '2026-10-20T14:00', end: '2026-10-19T10:00' }),
      );
      expect(created).toEqual(
        expect.objectContaining({ start: '2026-10-20T00:00', end: '2026-10-20T23:59' }),
      );
    });

    it('updates and removes events, cleaning recent history', () => {
      store.update('courses', draft({ title: 'Courses du samedi', start: '2026-10-17T10:00', end: '2026-10-17T11:00' }));
      expect(store.event('courses')?.title).toBe('Courses du samedi');
      expect(titles('2026-10-17')).toContain('Courses du samedi');

      store.remove('courses');
      expect(store.event('courses')).toBeUndefined();
      expect(store.recent().map((event) => event.id)).not.toContain('courses');
    });

    it('keeps the five most recently opened events', () => {
      store.markViewed('cinema');
      store.markViewed('cinema');
      store.markViewed('dentiste');
      expect(store.recent().map((event) => event.id)).toEqual([
        'dentiste', 'cinema', 'rendez-vous-projet', 'courses', 'anniversaire-camille',
      ]);
    });

    it('adds contacts, ignoring blank names', () => {
      expect(store.addContact('   ')).toBeNull();
      expect(store.addContact('zoé')).toEqual(
        expect.objectContaining({ name: 'zoé', initials: 'Z', frequent: false }),
      );
    });
  });

  it('opens events on their next occurrence, or their only date', () => {
    expect(store.displayDate(store.event('sport')!)).toBe('2026-10-15');
    expect(store.displayDate(store.event('dentiste')!)).toBe('2026-10-09');
    expect(store.now()).toBe('2026-10-15T10:30');
  });

  it('persists settings through the data adapter', () => {
    store.updateSettings({ hourFormat: '12h' });
    const adapter = TestBed.inject(PLANO_DATA_ADAPTER) as MemoryPlanoDataAdapter;
    expect(adapter.load()?.agenda.settings.hourFormat).toBe('12h');
  });
});
