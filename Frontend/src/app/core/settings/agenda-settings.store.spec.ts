import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { DEFAULT_AGENDA_USER_SETTINGS, type AgendaUserSettings } from '@plano/common';
import { providePlanoTesting, settle } from '../../testing/plano-testing';
import { AuthService } from '../auth/auth.service';
import { PlanoDataStore } from '../data/plano-data.store';
import { AgendaSettingsStore } from './agenda-settings.store';

const URL = '/api/v1/settings/agenda';
const serverSettings = (changes: Partial<AgendaUserSettings> = {}): AgendaUserSettings => ({
  ...DEFAULT_AGENDA_USER_SETTINGS,
  ...changes,
});

describe('AgendaSettingsStore', () => {
  const user = signal<{ id: string } | null>(null);
  let http: HttpTestingController;

  const store = () => TestBed.inject(AgendaSettingsStore);
  /** Creates the store and lets its sign-in effect run. */
  const start = () => {
    const created = store();
    TestBed.tick();
    return created;
  };
  const local = () => TestBed.inject(PlanoDataStore).data().agenda;

  beforeEach(() => {
    user.set(null);
    TestBed.configureTestingModule({
      providers: [...providePlanoTesting([], { settingsApi: false }), { provide: AuthService, useValue: { user } }],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('loading', () => {
    it('asks nothing while nobody is signed in, and shows the defaults', async () => {
      const settings = start();
      await settings.load();

      http.expectNone(URL);
      expect(settings.settings()).toEqual(DEFAULT_AGENDA_USER_SETTINGS);
    });

    it('loads the account’s settings once, when someone signs in', async () => {
      user.set({ id: 'ada' });
      const settings = start();
      const loading = settings.load();

      http.expectOne({ method: 'GET', url: URL }).flush(serverSettings({ weekStartsOn: 0 }));
      await loading;
      expect(settings.settings().weekStartsOn).toBe(0);

      // Already there: nothing more is asked.
      await settings.load();
      TestBed.tick();
      http.expectNone(URL);
    });

    it('never shows an account the settings of the previous one', async () => {
      user.set({ id: 'ada' });
      const settings = start();
      http.expectOne(URL).flush(serverSettings({ hourFormat: '12h' }));
      await settle();

      user.set({ id: 'bob' });
      expect(settings.settings().hourFormat).toBe('24h');
      TestBed.tick();
      http.expectOne(URL).flush(serverSettings({ showWeekNumbers: true }));
      await settle();

      expect(settings.settings()).toEqual(serverSettings({ showWeekNumbers: true }));
    });

    it('keeps the defaults when the API fails, and tries again next time', async () => {
      user.set({ id: 'ada' });
      const settings = start();
      http.expectOne(URL).flush({}, { status: 500, statusText: 'Error' });
      await settle();
      expect(settings.settings()).toEqual(DEFAULT_AGENDA_USER_SETTINGS);

      const loading = settings.load();
      http.expectOne(URL).flush(serverSettings({ showTasks: false }));
      await loading;
      expect(settings.settings().showTasks).toBe(false);
    });

    it('drops an answer that arrives after signing out', async () => {
      user.set({ id: 'ada' });
      const settings = start();
      const request = http.expectOne(URL);
      user.set(null);
      request.flush(serverSettings({ hourFormat: '12h' }));
      await settle();

      expect(settings.settings().hourFormat).toBe('24h');
    });
  });

  describe('changes', () => {
    beforeEach(async () => {
      user.set({ id: 'ada' });
      start();
      http.expectOne(URL).flush(serverSettings());
      await settle();
    });

    it('shows a change at once and sends only what changed', () => {
      store().update({ showPastEvents: false });

      expect(store().settings().showPastEvents).toBe(false);
      const request = http.expectOne({ method: 'PATCH', url: URL });
      expect(request.request.body).toEqual({ showPastEvents: false });
      request.flush(serverSettings({ showPastEvents: false }));
    });

    it('sends changes one after the other, in the order they were made', () => {
      store().update({ weekStartsOn: 0 });
      store().update({ weekStartsOn: 1, showTasks: false });

      // The second waits for the first: the server applies them in order.
      const first = http.expectOne({ method: 'PATCH', url: URL });
      expect(first.request.body).toEqual({ weekStartsOn: 0 });
      first.flush(serverSettings({ weekStartsOn: 0 }));
      const second = http.expectOne({ method: 'PATCH', url: URL });
      expect(second.request.body).toEqual({ weekStartsOn: 1, showTasks: false });
      second.flush(serverSettings({ showTasks: false }));

      // The answers do not undo a change made since.
      expect(store().settings()).toEqual(serverSettings({ showTasks: false }));
    });

    it('goes back to what the server holds when a change is refused', async () => {
      store().update({ hourFormat: '12h' });
      http.expectOne({ method: 'PATCH', url: URL }).flush({}, { status: 500, statusText: 'Error' });

      http.expectOne({ method: 'GET', url: URL }).flush(serverSettings({ showWeekNumbers: true }));
      await settle();
      expect(store().settings()).toEqual(serverSettings({ showWeekNumbers: true }));
    });
  });

  /** What a browser stored before the settings followed the account goes there once. */
  describe('moving the browser’s settings', () => {
    beforeEach(() => {
      TestBed.inject(PlanoDataStore).update((data) => ({
        ...data,
        agenda: {
          ...data.agenda,
          settings: { ...data.agenda.settings, hourFormat: '12h' },
          filters: { ...data.agenda.filters, hiddenCalendarIds: ['sport'] },
          calendars: data.agenda.calendars.map((calendar) =>
            calendar.id === 'travail' ? { ...calendar, color: '#22a95a' } : calendar,
          ),
        },
      }));
      user.set({ id: 'ada' });
    });

    it('sends what this browser changed to an untouched account, then forgets it', async () => {
      const settings = start();
      // Recently opened items alone do not make an account set up.
      http.expectOne({ method: 'GET', url: URL }).flush(serverSettings({ recentIds: ['e1'] }));
      await settle();

      const request = http.expectOne({ method: 'PATCH', url: URL });
      expect(request.request.body).toEqual({
        hourFormat: '12h',
        hiddenCalendarIds: ['sport'],
        calendarColors: { travail: '#22a95a' },
      });
      const saved = serverSettings({ ...request.request.body, recentIds: ['e1'] });
      request.flush(saved);
      await settle();

      expect(settings.settings()).toEqual(saved);
      expect(local().settings.hourFormat).toBe('24h');
      expect(local().filters.hiddenCalendarIds).toEqual([]);
      expect(local().calendars.find(({ id }) => id === 'travail')?.color).toBe('#3264ed');
    });

    it('leaves an account set up on another device as it is, and forgets this browser’s', async () => {
      const settings = start();
      http.expectOne(URL).flush(serverSettings({ weekStartsOn: 0 }));
      await settle();

      http.expectNone({ method: 'PATCH', url: URL });
      expect(settings.settings()).toEqual(serverSettings({ weekStartsOn: 0 }));
      expect(local().settings.hourFormat).toBe('24h');
    });

    it('keeps them for the next launch when sending fails', async () => {
      const settings = start();
      http.expectOne(URL).flush(serverSettings());
      await settle();
      http.expectOne({ method: 'PATCH', url: URL }).flush({}, { status: 503, statusText: 'Unavailable' });
      await settle();

      expect(local().settings.hourFormat).toBe('12h');
      expect(settings.settings()).toEqual(DEFAULT_AGENDA_USER_SETTINGS);
    });

    it('forgets them when the API refuses them, as it always would', async () => {
      start();
      http.expectOne(URL).flush(serverSettings());
      await settle();
      http.expectOne({ method: 'PATCH', url: URL }).flush({}, { status: 400, statusText: 'Bad Request' });
      await settle();

      expect(local().settings.hourFormat).toBe('24h');
      expect(local().filters.hiddenCalendarIds).toEqual([]);
    });
  });
});
