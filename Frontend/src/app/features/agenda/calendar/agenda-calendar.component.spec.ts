import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { NotificationsStore } from '../../../core/notifications/notifications.store';
import { notification } from '../../../testing/notifications-fixtures';
import { emptyNotifications, flushListReminders, loadAgendaEvents, providePlanoTesting } from '../../../testing/plano-testing';
import { AGENDA_ROUTES } from '../agenda.routes';
import { AgendaStore } from '../agenda.store';
import { AgendaCalendarComponent } from './agenda-calendar.component';

/** Integration spec: real agenda routes, so view and date really come from the URL. */
describe('AgendaCalendarComponent', () => {
  let harness: RouterTestingHarness;
  let router: Router;

  const element = (): HTMLElement => harness.routeNativeElement as HTMLElement;
  const component = (): AgendaCalendarComponent =>
    harness.fixture.debugElement.query((node) => node.componentInstance instanceof AgendaCalendarComponent)
      .componentInstance as AgendaCalendarComponent;
  const cardTitles = (): string[] =>
    Array.from(element().querySelectorAll('app-agenda-item-card strong')).map((node) => node.textContent?.replace('Tâche :', '').trim() ?? '');
  const settle = async (): Promise<void> => {
    await harness.fixture.whenStable();
    harness.detectChanges();
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: providePlanoTesting([{ path: 'agenda', children: AGENDA_ROUTES }]),
    });
    router = TestBed.inject(Router);
    await loadAgendaEvents();
    harness = await RouterTestingHarness.create();
  });

  it('leads to the settings with the gear used on every screen', async () => {
    await harness.navigateByUrl('/agenda');
    flushListReminders();
    await settle();

    const settings = element().querySelector('[aria-label="Paramètres de l’agenda"]');
    expect(settings?.getAttribute('href')).toBe('/agenda/settings');
    expect(settings?.querySelector('path')?.getAttribute('d')).toMatch(/^M12\.2 2h/);
    expect(settings?.querySelectorAll('circle')).toHaveLength(1);
  });

  it('opens the filters from the funnel used on every screen', async () => {
    await harness.navigateByUrl('/agenda');
    flushListReminders();
    await settle();

    const filters = element().querySelector('[aria-label="Filtrer l’agenda"]');
    expect(filters?.getAttribute('href')).toBe('/agenda/filters');
    expect(filters?.querySelector('path')?.getAttribute('d')).toBe('M4 5h16l-6 7.5V19l-4-2v-4.5Z');
    // As on the lists screen, search sits right next to the settings.
    expect(Array.from(element().querySelectorAll('.header-actions > a'), (link) => link.getAttribute('href'))).toEqual([
      '/agenda/filters',
      '/agenda/search',
      '/agenda/settings',
    ]);
  });

  it('opens on today’s day view with a "now" marker between past and upcoming items', async () => {
    await harness.navigateByUrl('/agenda');
    flushListReminders();
    await settle();

    // Just the date: the button itself opens the date picker, no arrow needed.
    expect(element().querySelector('.date-bar .title')?.textContent?.trim()).toBe('Jeudi 15 octobre');
    expect(element().querySelector('.date-bar .today')).toBeNull();
    expect(cardTitles()).toEqual(['Rendez-vous projet', 'Courses', 'Déjeuner', 'Appel avec Camille', 'Sport', 'Lait', 'Restaurant']);
    const rows = Array.from(element().querySelectorAll('.timeline > div'));
    const nowIndex = rows.findIndex((row) => row.classList.contains('now'));
    expect(rows[nowIndex].textContent).toContain('10:30');
    expect(rows[nowIndex + 1].textContent).toContain('Courses');
    // The week strip marks days that have something planned.
    expect(element().querySelectorAll('.strip button').length).toBe(7);
    expect(element().querySelector('.strip .selected .dots em')).not.toBeNull();
    expect(element().querySelector('app-bottom-nav .active')?.textContent).toContain('Agenda');
    // The agenda tab draws a calendar icon instead of a text glyph.
    expect(element().querySelector('app-bottom-nav .active svg path')?.getAttribute('d')).toContain('M4 10h16');
    expect(element().querySelector('app-bottom-nav .active span')).toBeNull();
  });

  it('puts the yellow dot on the events with unread news, not on the others', async () => {
    await harness.navigateByUrl('/agenda');
    flushListReminders();
    await settle();
    // Once the app has started: signed out, the store first clears what it holds.
    const notifications = TestBed.inject(NotificationsStore);
    const loading = notifications.load();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/v1/notifications')
      .flush({
        items: [
          notification({ area: 'agenda', kind: 'agenda.declined', targetId: 'sport', itemIds: [] }),
          notification({ id: 'n-2', area: 'agenda', kind: 'agenda.accepted', targetId: 'rendez-vous-projet', itemIds: [], read: true }),
        ],
        unread: { ...emptyNotifications().unread, agenda: 1 },
      });
    await loading;
    await settle();

    const marked = Array.from(element().querySelectorAll('app-agenda-item-card'))
      .filter((card) => card.querySelector('app-news-dot'))
      .map((card) => card.querySelector('strong')?.textContent?.trim());
    expect(marked).toEqual(['Sport']);
    // Inside the card's link, so screen readers hear it with the event.
    expect(element().querySelector('app-agenda-item-card a app-news-dot [role="img"]')?.getAttribute('aria-label')).toBe('Nouveau');
  });

  it('moves between days and back to today, keeping it in the URL', async () => {
    await harness.navigateByUrl('/agenda');
    (element().querySelector('[aria-label="Période suivante"]') as HTMLButtonElement).click();
    await settle();

    expect(router.url).toBe('/agenda?view=day&date=2026-10-16');
    expect(cardTitles()).toEqual(['Anniversaire de Camille']);
    expect(element().querySelector('.timeline .time')?.textContent).toBe('Journée');

    (element().querySelector('.date-bar .today') as HTMLButtonElement).click();
    await settle();
    expect(router.url).toBe('/agenda?view=day&date=2026-10-15');

    (element().querySelectorAll('.strip button')[0] as HTMLButtonElement).click();
    await settle();
    expect(router.url).toContain('date=2026-10-12');
  });

  it('switches views from the menu', async () => {
    await harness.navigateByUrl('/agenda');
    (element().querySelector('[aria-label="Changer de vue"]') as HTMLButtonElement).click();
    harness.detectChanges();
    const options = element().querySelectorAll<HTMLButtonElement>('.view-menu button');
    expect(Array.from(options).map((option) => option.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);

    options[1].click();
    await settle();
    expect(router.url).toBe('/agenda?view=week&date=2026-10-15');
    expect(element().querySelector('.date-bar .title')?.textContent).toContain('12 oct. – 18 oct.');
    expect(element().querySelectorAll('app-agenda-week-view .column').length).toBe(7);
    expect(element().querySelectorAll('app-agenda-week-view .block').length).toBeGreaterThan(8);
  });

  it('pages through weeks and months', async () => {
    await harness.navigateByUrl('/agenda?view=week&date=2026-10-15');
    component().shift(-1);
    await settle();
    expect(router.url).toContain('date=2026-10-08');

    await harness.navigateByUrl('/agenda?view=month&date=2026-01-31');
    component().shift(1);
    await settle();
    // 31 January + 1 month is clamped to the last day of February.
    expect(router.url).toContain('date=2026-02-28');
    expect(element().querySelector('.date-bar .title')?.textContent).toContain('Février 2026');
  });

  it('shows the month grid with coloured dots and the selected day below', async () => {
    await harness.navigateByUrl('/agenda?view=month&date=2026-10-15');
    flushListReminders();
    await settle();

    expect(element().querySelector('app-agenda-month-view h2')?.textContent).toBe('Jeudi 15 octobre');
    expect(cardTitles().length).toBe(7);
    const selected = element().querySelector('app-agenda-month-view .selected') as HTMLElement;
    expect(selected.querySelectorAll('em').length).toBe(3);

    TestBed.inject(AgendaStore).updateSettings({ showWeekNumbers: true, weekStartsOn: 0 });
    harness.detectChanges();
    expect(element().querySelector('.week-number')).not.toBeNull();
    expect(element().querySelector('app-agenda-month-view .weekday:nth-child(2)')?.textContent).toBe('Dim');
  });

  it('jumps to a date picked in the native date input, ignoring invalid values', async () => {
    await harness.navigateByUrl('/agenda');
    const picker = element().querySelector('.picker') as HTMLInputElement;
    const showPicker = vi.spyOn(picker, 'showPicker').mockImplementation(() => {
      throw new Error('not supported');
    });
    const focus = vi.spyOn(picker, 'focus').mockReturnValue(undefined);

    (element().querySelector('.date-bar .title') as HTMLButtonElement).click();
    expect(showPicker).toHaveBeenCalledTimes(1);
    // Browsers without showPicker() still get a focused input.
    expect(focus).toHaveBeenCalledTimes(1);

    component().pickDate('pas une date');
    await settle();
    expect(router.url).toBe('/agenda');
    component().pickDate('2026-12-24');
    await settle();
    expect(router.url).toContain('date=2026-12-24');
  });

  it('creates an event from a free slot of the week grid', async () => {
    const navigate = vi.spyOn(router, 'navigate');
    await harness.navigateByUrl('/agenda?view=week&date=2026-10-15');

    navigate.mockClear();
    component().createAt({ date: '2026-10-14', time: '08:00' });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(['/agenda/new'], { queryParams: { date: '2026-10-14', time: '08:00' } });
  });

  it('falls back to today for malformed dates and shows the filter badge', async () => {
    TestBed.inject(AgendaStore).toggleCalendar('sport');
    await harness.navigateByUrl('/agenda?view=nope&date=hier');

    expect(component().view()).toBe('day');
    expect(component().date()).toBe('2026-10-15');
    expect(element().querySelector('.badge')?.textContent).toBe('1');
    expect(cardTitles()).not.toContain('Sport');
  });
});
