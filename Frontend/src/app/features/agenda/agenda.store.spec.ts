import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { AgendaEvent } from '@plano/common';
import { MemoryPlanoDataAdapter, PLANO_DATA_ADAPTER } from '../../core/data/plano-data.adapter';
import { personColor } from '../../core/people/people';
import { CONTACTS, contact } from '../../testing/contacts';
import { flushListReminders, providePlanoTesting, settle } from '../../testing/plano-testing';
import { AgendaEventDraft, AgendaStore, toAgendaContact } from './agenda.store';

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

    it('recolors a calendar for its events that have no color of their own', () => {
      store.setCalendarColor('personnel', '#22a95a');

      expect(store.calendar('personnel')?.color).toBe('#22a95a');
      expect(store.colorOf(store.event('dejeuner')!)).toBe('#22a95a');
      // "Restaurant" carries its own color: it keeps it.
      expect(store.colorOf(store.event('restaurant')!)).toBe('#e65591');
      expect(store.calendar('travail')?.color).toBe('#3264ed');
    });

    it('ignores colors outside the palette and unknown calendars', () => {
      const calendars = store.calendars();

      store.setCalendarColor('personnel', 'red; background: url(https://evil.test)');
      store.setCalendarColor('missing', '#22a95a');

      expect(store.calendars()).toBe(calendars);
    });

    it('keeps only participants from the contact list', () => {
      const contactsBefore = store.contacts();
      const created = store.create(draft({ participantIds: ['camille', 'stranger', 'alex'] }));
      expect(created.participantIds).toEqual(['camille', 'alex']);

      store.update(created.id, draft({ participantIds: ['unknown', 'jules'] }));
      expect(store.event(created.id)?.participantIds).toEqual(['jules']);
      expect(store.contacts()).toEqual(contactsBefore);
    });
  });

  describe('contacts', () => {
    it('loads the invitable contacts and resolves participants from them first', async () => {
      const http = TestBed.inject(HttpTestingController);
      const loading = store.loadContacts();
      http.expectOne('/api/v1/contacts').flush(CONTACTS);

      await expect(loading).resolves.toBe(true);
      expect(store.invitable()).toEqual(CONTACTS);
      expect(store.contact('user-bob')).toEqual({
        id: 'user-bob',
        name: 'Bob Test',
        initials: 'BT',
        color: personColor('user-bob'),
        frequent: true,
      });
      // Seed contacts of the demo events still resolve.
      expect(store.contact('camille')?.name).toBe('Camille');
      expect(store.create(draft({ participantIds: ['user-dan', 'nobody'] })).participantIds).toEqual(['user-dan']);
    });

    it('keeps the previous contacts when the API fails', async () => {
      const http = TestBed.inject(HttpTestingController);
      const loading = store.loadContacts();
      http.expectOne('/api/v1/contacts').flush({ message: 'Erreur' }, { status: 500, statusText: 'Server Error' });

      await expect(loading).resolves.toBe(false);
      expect(store.invitable()).toEqual([]);
    });

    it('names a contact without a name after their username', () => {
      expect(toAgendaContact(contact('user-x', '', { lastName: '', username: 'xavier' }))).toEqual(
        expect.objectContaining({ name: 'xavier', initials: 'XA', frequent: false }),
      );
    });
  });

  it('opens events on their next occurrence, or their only date', () => {
    expect(store.displayDate(store.event('sport')!)).toBe('2026-10-15');
    expect(store.displayDate(store.event('dentiste')!)).toBe('2026-10-09');
    expect(store.now()).toBe('2026-10-15T10:30');
  });

  it('persists settings through the data adapter', () => {
    const adapter = TestBed.inject(PLANO_DATA_ADAPTER) as MemoryPlanoDataAdapter;
    const save = vi.spyOn(adapter, 'save');
    store.updateSettings({ hourFormat: '12h' });

    // One write per change, carrying the whole data set.
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].agenda.settings.hourFormat).toBe('12h');
    expect(adapter.load()?.agenda.settings.hourFormat).toBe('12h');
  });
});
