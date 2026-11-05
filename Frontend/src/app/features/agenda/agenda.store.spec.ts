import { HttpTestingController } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { AgendaEventView, SaveAgendaEventRequest } from '@plano/common';
import { AuthService } from '../../core/auth/auth.service';
import { MemoryPlanoDataAdapter, PLANO_DATA_ADAPTER } from '../../core/data/plano-data.adapter';
import { PlanoDataStore } from '../../core/data/plano-data.store';
import { personColor } from '../../core/people/people';
import { CONTACTS, contact } from '../../testing/contacts';
import { FakeEventSource } from '../../testing/fake-event-source';
import {
  agendaView,
  flushAgendaEvents,
  flushListReminders,
  flushObjectiveAgenda,
  providePlanoTesting,
  seedAgendaEvents,
  settle,
} from '../../testing/plano-testing';
import { AgendaEventDraft, AgendaStore, toAgendaContact } from './agenda.store';

const EVENTS_URL = '/api/v1/agenda/events';

/** An invitation from Bob, as the API serves it to its guest. */
function invitation(changes: Partial<AgendaEventView> = {}): AgendaEventView {
  const [first] = seedAgendaEvents();
  return {
    ...first,
    id: 'invitation',
    title: 'Réunion chez Bob',
    start: '2026-10-16T14:00',
    end: '2026-10-16T15:00',
    calendarId: '',
    reminderMinutes: null,
    participantIds: ['me'],
    owner: { id: 'user-bob', name: 'Bob Test', avatarVersion: 5 },
    mine: false,
    status: 'pending',
    attendees: [{ id: 'me', name: 'Vous', avatarVersion: null, status: 'pending' }],
    ...changes,
  };
}

describe('AgendaStore', () => {
  let store: AgendaStore;
  let http: HttpTestingController;
  const titles = (date: string): string[] => store.itemsOn(date).map((item) => item.title);

  function draft(changes: Partial<AgendaEventDraft> = {}): AgendaEventDraft {
    const { id: _id, owner: _owner, mine: _mine, status: _status, attendees: _attendees, ...base } =
      store.event('dejeuner')!;
    return { ...base, ...changes };
  }

  /** Answers the pending request to `url` with the event it was sent, as the API echoes it. */
  function echo(method: string, url: string, id: string): SaveAgendaEventRequest {
    const request = http.expectOne((candidate) => candidate.method === method && candidate.url === url);
    const body = request.request.body as SaveAgendaEventRequest;
    request.flush(agendaView({ ...body, id }));
    return body;
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({
      // Signed in as the fixtures' "me", so the live stream opens.
      providers: [...providePlanoTesting(), { provide: AuthService, useValue: { user: signal({ id: 'me' }) } }],
    });
    store = TestBed.inject(AgendaStore);
    http = TestBed.inject(HttpTestingController);
    void store.load();
    flushAgendaEvents();
    flushListReminders();
    flushObjectiveAgenda([
      {
        kind: 'session',
        key: 'session:run-12',
        objectiveId: 'courir-10-km',
        objectiveTitle: 'Courir 10 km',
        category: 'health',
        date: '2026-10-17',
        label: 'Sortie 7 km',
      },
      {
        kind: 'deadline',
        key: 'deadline:lire',
        objectiveId: 'lire',
        objectiveTitle: 'Lire 12 livres',
        category: 'learning',
        date: '2026-10-17',
        label: 'Lire 12 livres',
      },
    ]);
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

    it('shows planned objective sessions and deadlines as all-day tasks, first', () => {
      expect(titles('2026-10-17')).toEqual(['Sortie 7 km', 'Échéance : Lire 12 livres', 'Cinéma']);
      const [session, deadline] = store.itemsOn('2026-10-17');
      expect(session).toEqual(
        expect.objectContaining({
          key: 'objective:session:run-12',
          allDay: true,
          subtitle: 'Objectif · Courir 10 km',
          link: ['/objectives', 'courir-10-km', 'calendar'],
        }),
      );
      expect(deadline).toEqual(
        expect.objectContaining({ subtitle: 'Objectif · Lire 12 livres', link: ['/objectives', 'lire'] }),
      );
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
    it('creates an event through the API and fixes a non-positive duration with the default one', async () => {
      const saving = store.create(draft({ title: '  Café  ', start: '2026-10-16T08:00', end: '2026-10-16T07:00' }));
      const sent = echo('POST', EVENTS_URL, 'cafe');

      expect(sent).toEqual(expect.objectContaining({ title: 'Café', start: '2026-10-16T08:00', end: '2026-10-16T09:00' }));
      // Only what the API accepts: no id, organiser or answers.
      expect(Object.keys(sent)).not.toEqual(expect.arrayContaining(['id']));
      expect(sent).not.toHaveProperty('owner');
      expect(await saving).toEqual(expect.objectContaining({ id: 'cafe', title: 'Café' }));
      expect(titles('2026-10-16')).toContain('Café');
      expect(store.error()).toBe('');
    });

    it('stretches all-day events over whole days', async () => {
      const saving = store.create(draft({ allDay: true, start: '2026-10-20T14:00', end: '2026-10-19T10:00' }));

      expect(echo('POST', EVENTS_URL, 'jour')).toEqual(
        expect.objectContaining({ start: '2026-10-20T00:00', end: '2026-10-20T23:59' }),
      );
      await saving;
    });

    it('sends each guest once, never the user', async () => {
      const saving = store.create(draft({ participantIds: ['user-bob', 'me', 'user-cyd', 'user-bob'] }));

      expect(echo('POST', EVENTS_URL, 'avec-bob').participantIds).toEqual(['user-bob', 'user-cyd']);
      await saving;
    });

    it('updates an event in place', async () => {
      const saving = store.update(
        'courses',
        draft({ title: 'Courses du samedi', start: '2026-10-17T10:00', end: '2026-10-17T11:00' }),
      );
      echo('PUT', `${EVENTS_URL}/courses`, 'courses');
      await saving;

      expect(store.event('courses')?.title).toBe('Courses du samedi');
      expect(titles('2026-10-17')).toContain('Courses du samedi');
      expect(store.events().filter(({ id }) => id === 'courses')).toHaveLength(1);
    });

    it('removes an event, cleaning recent history', async () => {
      const removing = store.remove('courses');
      const request = http.expectOne(`${EVENTS_URL}/courses`);
      expect(request.request.method).toBe('DELETE');
      request.flush(null, { status: 204, statusText: 'No Content' });

      await expect(removing).resolves.toBe(true);
      expect(store.event('courses')).toBeUndefined();
      expect(store.recent().map((event) => event.id)).not.toContain('courses');
    });

    it('keeps everything as it was when the API refuses, with its message', async () => {
      const before = store.events();
      const saving = store.create(draft({ participantIds: ['user-zoe'] }));
      http
        .expectOne(EVENTS_URL)
        .flush({ message: 'Seuls vos contacts peuvent être invités.' }, { status: 400, statusText: 'Bad Request' });

      await expect(saving).resolves.toBeNull();
      expect(store.error()).toBe('Seuls vos contacts peuvent être invités.');
      expect(store.events()).toBe(before);

      const removing = store.remove('courses');
      http.expectOne(`${EVENTS_URL}/courses`).flush(null, { status: 0, statusText: 'Unknown Error' });
      await expect(removing).resolves.toBe(false);
      expect(store.event('courses')).toBeDefined();
      expect(store.error()).toBe('Impossible de joindre Plano. Vérifiez votre connexion.');
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
  });

  describe('invitations', () => {
    beforeEach(async () => {
      const loading = store.load();
      flushAgendaEvents([...seedAgendaEvents(), invitation()]);
      flushListReminders();
      flushObjectiveAgenda();
      await loading;
    });

    it('keeps a pending invitation off the calendar, and names its organiser', () => {
      expect(store.invitations().map(({ id }) => id)).toEqual(['invitation']);
      expect(store.events().map(({ id }) => id)).not.toContain('invitation');
      expect(titles('2026-10-16')).not.toContain('Réunion chez Bob');
      expect(store.event('invitation')?.title).toBe('Réunion chez Bob');
      // Bob is no contact of this test user: the event still names him.
      expect(store.contact('user-bob')).toEqual(
        expect.objectContaining({ name: 'Bob Test', initials: 'BT', avatarVersion: 5 }),
      );
    });

    it('files an accepted invitation in the first visible calendar, with the usual reminder', async () => {
      store.toggleCalendar('personnel');
      const answering = store.respond('invitation', 'accepted');
      const request = http.expectOne(`${EVENTS_URL}/invitation/response`);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ status: 'accepted', calendarId: 'travail', reminderMinutes: 15 });
      request.flush(invitation({ status: 'accepted', calendarId: 'travail', reminderMinutes: 15 }));

      await expect(answering).resolves.toBe(true);
      expect(store.invitations()).toEqual([]);
      expect(titles('2026-10-16')).toContain('Réunion chez Bob');
    });

    it('drops a declined invitation from the agenda and the recent ones', async () => {
      store.markViewed('invitation');
      const answering = store.respond('invitation', 'declined');
      const request = http.expectOne(`${EVENTS_URL}/invitation/response`);
      expect(request.request.body).toEqual({ status: 'declined' });
      request.flush(invitation({ status: 'declined' }));

      await expect(answering).resolves.toBe(true);
      expect(store.invitations()).toEqual([]);
      expect(store.events().map(({ id }) => id)).not.toContain('invitation');
      expect(store.recent().map(({ id }) => id)).not.toContain('invitation');
      // Still there to change one's mind from its link.
      expect(store.event('invitation')?.status).toBe('declined');
    });
  });

  describe('loading', () => {
    it('opens an event it does not hold from the API, once', async () => {
      const opening = store.open('ancienne');
      http.expectOne(`${EVENTS_URL}/ancienne`).flush(invitation({ id: 'ancienne', status: 'declined' }));

      await expect(opening).resolves.toBe(true);
      expect(store.event('ancienne')?.status).toBe('declined');
      await expect(store.open('ancienne')).resolves.toBe(true);
      await expect(store.open('dejeuner')).resolves.toBe(true);
      http.expectNone(`${EVENTS_URL}/dejeuner`);
    });

    it('says when an event cannot be opened', async () => {
      const opening = store.open('inconnu');
      http.expectOne(`${EVENTS_URL}/inconnu`).flush({ message: 'Événement introuvable.' }, { status: 404, statusText: 'Not Found' });

      await expect(opening).resolves.toBe(false);
      expect(store.event('inconnu')).toBeUndefined();
    });

    it('loads the events only once for screens that need them at once', async () => {
      await store.ensureLoaded();
      http.expectNone(EVENTS_URL);
      expect(store.events().length).toBe(seedAgendaEvents().length);
    });

    it('reloads the events when one of them changes elsewhere', async () => {
      TestBed.tick();
      FakeEventSource.latest()?.emit({ type: 'agenda.changed', eventId: 'invitation' });
      http.expectOne(EVENTS_URL).flush([...seedAgendaEvents(), invitation()]);
      await settle();

      expect(store.invitations().map(({ id }) => id)).toEqual(['invitation']);
    });

    it('keeps what it shows when the API cannot be reached', async () => {
      const loading = store.load();
      http.expectOne(EVENTS_URL).flush(null, { status: 0, statusText: 'Unknown Error' });
      flushListReminders();
      flushObjectiveAgenda();
      await loading;

      expect(store.events().length).toBe(seedAgendaEvents().length);
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
        avatarVersion: null,
        id: 'user-bob',
        name: 'Bob Test',
        initials: 'BT',
        color: personColor('user-bob'),
        frequent: true,
      });
      // Guests of the events resolve too.
      expect(store.contact('camille')?.name).toBe('Camille');
    });

    it('keeps the previous contacts when the API fails', async () => {
      const http = TestBed.inject(HttpTestingController);
      const loading = store.loadContacts();
      http.expectOne('/api/v1/contacts').flush({ message: 'Erreur' }, { status: 500, statusText: 'Server Error' });

      await expect(loading).resolves.toBe(false);
      expect(store.invitable()).toEqual([]);
    });

    it('names a contact without a name after their username', () => {
      expect(toAgendaContact(contact('user-y', 'Yann', { avatarVersion: 88 })).avatarVersion).toBe(88);
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

/** What a browser stored before the agenda moved to the API goes there once. */
describe('AgendaStore import', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: providePlanoTesting() });
    http = TestBed.inject(HttpTestingController);
    const data = TestBed.inject(PlanoDataStore);
    const [first, second] = seedAgendaEvents();
    data.update((current) => ({
      ...current,
      agenda: { ...current.agenda, events: [first, { ...second, conferenceUrl: 'javascript:alert(1)' }] },
    }));
  });

  const local = () => TestBed.inject(PlanoDataStore).data().agenda;

  it('sends the local events without their guests, then forgets them', async () => {
    const loading = TestBed.inject(AgendaStore).ensureLoaded();
    const request = http.expectOne(`${EVENTS_URL}/import`);
    const { events } = request.request.body as { events: Record<string, unknown>[] };
    expect(events.map(({ localId }) => localId)).toEqual(['rendez-vous-projet', 'courses']);
    expect(events.every((event) => !('participantIds' in event) && !('id' in event))).toBe(true);
    // A link the API would refuse is dropped, not the whole import.
    expect(events[1]['conferenceUrl']).toBe('');
    request.flush({ imported: 2 });
    await settle();
    flushAgendaEvents();
    await loading;

    expect(local().events).toEqual([]);
    expect(local().recentIds).toEqual([]);
    expect(TestBed.inject(AgendaStore).events().length).toBe(seedAgendaEvents().length);
  });

  it('keeps them for next time when the import fails, and still loads', async () => {
    const loading = TestBed.inject(AgendaStore).ensureLoaded();
    http.expectOne(`${EVENTS_URL}/import`).flush({ message: 'Erreur' }, { status: 500, statusText: 'Error' });
    await settle();
    flushAgendaEvents([]);
    await loading;

    expect(local().events.map(({ id }) => id)).toEqual(['rendez-vous-projet', 'courses']);
  });
});
