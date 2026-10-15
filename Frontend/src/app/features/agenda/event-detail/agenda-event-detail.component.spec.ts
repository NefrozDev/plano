import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { providePlanoTesting } from '../../../testing/plano-testing';
import { AGENDA_ROUTES } from '../agenda.routes';
import { AgendaStore } from '../agenda.store';

describe('AgendaEventDetailComponent', () => {
  let harness: RouterTestingHarness;
  let store: AgendaStore;
  const element = (): HTMLElement => harness.routeNativeElement as HTMLElement;
  const facts = (): string[] =>
    Array.from(element().querySelectorAll('.facts li')).map((fact) => fact.textContent?.replace(/\s+/g, ' ').trim() ?? '');
  const rows = (): string[] =>
    Array.from(element().querySelectorAll('.rows div')).map(
      (row) => `${row.querySelector('dt')?.textContent?.trim()} ${row.querySelector('dd')?.textContent?.trim()}`,
    );

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: providePlanoTesting([{ path: 'agenda', children: AGENDA_ROUTES }]),
    });
    store = TestBed.inject(AgendaStore);
    harness = await RouterTestingHarness.create();
  });

  it('shows every detail of an event and remembers it was opened', async () => {
    await harness.navigateByUrl('/agenda/events/rendez-vous-projet?date=2026-10-15');

    expect(element().querySelector('h2')?.textContent).toContain('Rendez-vous projet');
    expect(facts().slice(0, 3)).toEqual(['Jeudi 15 octobre 2026', '09:00 – 10:30', 'Salle de réunion']);
    expect(facts()[3]).toContain('Avec');
    // Four avatars then "+1" for the fifth participant; names are exposed as one label.
    expect(element().querySelectorAll('.facts .avatar').length).toBe(5);
    expect(element().querySelector('.facts .avatar.more')?.textContent).toBe('+1');
    expect(element().querySelector('.facts .avatars')?.getAttribute('aria-label')).toBe('Camille, Alex, Emma, Jules, Chloé');
    expect(element().querySelector('.text')?.textContent).toContain('Point d’avancement');
    expect(rows()).toEqual(['Rappel 15 minutes avant', 'Calendrier Travail', 'Récurrence Jamais']);
    expect(element().querySelector('.actions a')?.getAttribute('href')).toBe('/agenda/events/rendez-vous-projet/edit');
    expect(store.recent()[0].id).toBe('rendez-vous-projet');
  });

  it('shows the requested occurrence of a recurring event', async () => {
    await harness.navigateByUrl('/agenda/events/sport?date=2026-10-22');

    expect(facts()[0]).toBe('Jeudi 22 octobre 2026');
    expect(rows()[2]).toBe('Récurrence Toutes les semaines');
  });

  it('defaults to the next occurrence and lists links, files and notes', async () => {
    await harness.navigateByUrl('/agenda/events/appel-camille');
    const conference = element().querySelector('.facts a') as HTMLAnchorElement;
    expect(conference.href).toBe('https://meet.example.com/plano-camille');
    expect(conference.rel).toBe('noopener noreferrer');

    await harness.navigateByUrl('/agenda/events/atelier-maquettes');
    expect(element().querySelector('.file')?.textContent).toContain('brief-maquettes.pdf');
    expect(element().querySelector('.file small')?.textContent).toBe('240 Ko');

    await harness.navigateByUrl('/agenda/events/week-end-mer');
    expect(facts()[0]).toBe('Du Samedi 24 octobre au Dimanche 25 octobre');
    expect(facts()[1]).toBe('Toute la journée');
    expect(element().textContent).toContain('Réserver le parking.');
  });

  it('confirms deletion in a modal and returns to the agenda on that day', async () => {
    await harness.navigateByUrl('/agenda/events/sport?date=2026-10-22');
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);

    (element().querySelector('.delete') as HTMLButtonElement).click();
    harness.detectChanges();
    TestBed.flushEffects();
    const dialog = element().querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBeTrue();
    expect(dialog.textContent).toContain('Toutes les occurrences');

    (dialog.querySelector('.confirm') as HTMLButtonElement).click();
    expect(store.event('sport')).toBeUndefined();
    expect(navigate).toHaveBeenCalledWith(['/agenda'], { queryParams: { date: '2026-10-22' }, replaceUrl: true });
  });

  it('can cancel the deletion', async () => {
    await harness.navigateByUrl('/agenda/events/courses');
    (element().querySelector('.delete') as HTMLButtonElement).click();
    harness.detectChanges();
    (element().querySelector('dialog .cancel') as HTMLButtonElement).click();
    harness.detectChanges();

    expect(store.event('courses')).toBeDefined();
    expect(element().querySelector('dialog')?.textContent).not.toContain('Toutes les occurrences');
  });

  it('explains when the event does not exist', async () => {
    await harness.navigateByUrl('/agenda/events/inconnu');

    expect(element().querySelector('.missing')?.textContent).toContain('n’existe pas');
    expect(store.recent().map((event) => event.id)).not.toContain('inconnu');
  });

  it('handles minimal events, unknown calendars and invalid dates', async () => {
    const created = store.create({
      ...store.event('dejeuner')!,
      title: 'Minimal',
      calendarId: 'disparu',
      reminderMinutes: null,
    });
    await harness.navigateByUrl(`/agenda/events/${created.id}?date=demain`);

    // Invalid ?date= falls back to the event's own date.
    expect(facts()).toEqual(['Jeudi 15 octobre 2026', '12:30 – 13:30']);
    expect(rows()).toEqual(['Rappel Aucun', 'Calendrier Sans calendrier', 'Récurrence Jamais']);
    expect(element().querySelector('.text')).toBeNull();
    expect(element().querySelector('.file')).toBeNull();
  });
});
