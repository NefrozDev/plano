import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { AgendaEventView } from '@plano/common';
import { NotificationsStore } from '../../../core/notifications/notifications.store';
import { CONTACTS } from '../../../testing/contacts';
import { agendaView, loadAgendaEvents, providePlanoTesting, seedAgendaEvents, settle } from '../../../testing/plano-testing';
import { AGENDA_ROUTES } from '../agenda.routes';
import { AgendaStore } from '../agenda.store';

const EVENTS_URL = '/api/v1/agenda/events';

/** Bob's meeting, as the API serves it to the user he invited. */
function invitation(changes: Partial<AgendaEventView> = {}): AgendaEventView {
  return agendaView(seedAgendaEvents()[0], {
    id: 'reunion-bob',
    title: 'Réunion chez Bob',
    calendarId: '',
    reminderMinutes: null,
    owner: { id: 'user-bob', name: 'Bob Test', avatarVersion: null },
    mine: false,
    status: 'pending',
    participantIds: ['me'],
    attendees: [{ id: 'me', name: 'Vous', avatarVersion: null, status: 'pending' }],
    ...changes,
  });
}

describe('AgendaEventDetailComponent', () => {
  let harness: RouterTestingHarness;
  let store: AgendaStore;
  let http: HttpTestingController;
  const element = (): HTMLElement => harness.routeNativeElement as HTMLElement;
  const facts = (): string[] =>
    Array.from(element().querySelectorAll('.facts li')).map((fact) => fact.textContent?.replace(/\s+/g, ' ').trim() ?? '');
  const rows = (): string[] =>
    Array.from(element().querySelectorAll('.rows div')).map(
      (row) => `${row.querySelector('dt')?.textContent?.trim()} ${row.querySelector('dd')?.textContent?.trim()}`,
    );
  const people = (): string[] =>
    Array.from(element().querySelectorAll('.people li')).map(
      (row) => `${row.querySelector('span')?.textContent?.trim()} · ${row.querySelector('small')?.textContent?.trim()}`,
    );
  const open = async (url: string): Promise<void> => {
    await harness.navigateByUrl(url);
    await settle();
    harness.detectChanges();
  };

  async function setUp(events: AgendaEventView[] = seedAgendaEvents()): Promise<void> {
    TestBed.configureTestingModule({
      providers: providePlanoTesting([{ path: 'agenda', children: AGENDA_ROUTES }]),
    });
    store = TestBed.inject(AgendaStore);
    http = TestBed.inject(HttpTestingController);
    await loadAgendaEvents(events);
    harness = await RouterTestingHarness.create();
  }

  describe('as the organiser', () => {
    beforeEach(() => setUp());

    it('shows every detail of an event, who is coming, and remembers it was opened', async () => {
      const markViewed = vi.spyOn(store, 'markViewed');
      await open('/agenda/events/rendez-vous-projet?date=2026-10-15');

      expect(markViewed).toHaveBeenCalledTimes(1);
      expect(markViewed).toHaveBeenCalledWith('rendez-vous-projet');
      expect(element().querySelector('h2')?.textContent).toContain('Rendez-vous projet');
      expect(facts()).toEqual(['Jeudi 15 octobre 2026', '09:00 – 10:30', 'Salle de réunion']);
      expect(people()).toEqual([
        'Vous · Organisateur',
        'Camille · Participe',
        'Alex · Participe',
        'Emma · Participe',
        'Jules · Participe',
        'Chloé · Participe',
      ]);
      expect(element().querySelector('.text')?.textContent).toContain('Point d’avancement');
      expect(rows()).toEqual(['Rappel 15 minutes avant', 'Calendrier Travail', 'Récurrence Jamais']);
      expect(element().querySelector('.actions a')?.getAttribute('href')).toBe('/agenda/events/rendez-vous-projet/edit');
      // Nothing to answer on one's own event.
      expect(element().querySelector('.answer')).toBeNull();
      expect(store.recent()[0].id).toBe('rendez-vous-projet');
    });

    it('reads what the bell says about this event while it is open', async () => {
      const notifications = TestBed.inject(NotificationsStore);
      vi.spyOn(notifications, 'hasUnread').mockImplementation((area, targetId) => area === 'agenda' && targetId === 'sport');
      const markRead = vi.spyOn(notifications, 'markRead').mockResolvedValue();

      await open('/agenda/events/sport');

      expect(markRead).toHaveBeenCalledTimes(1);
      expect(markRead).toHaveBeenCalledWith('agenda', 'sport');
    });

    it('shows the requested occurrence of a recurring event', async () => {
      await open('/agenda/events/sport?date=2026-10-22');

      expect(facts()[0]).toBe('Jeudi 22 octobre 2026');
      expect(rows()[2]).toBe('Récurrence Toutes les semaines');
      // Nobody invited: no list of participants.
      expect(element().querySelector('.people')).toBeNull();
    });

    it('defaults to the next occurrence and lists links, files and notes', async () => {
      await open('/agenda/events/appel-camille');
      const conference = element().querySelector('.facts a') as HTMLAnchorElement;
      expect(conference.href).toBe('https://meet.example.com/plano-camille');
      expect(conference.rel).toBe('noopener noreferrer');

      await open('/agenda/events/atelier-maquettes');
      expect(element().querySelector('.file')?.textContent).toContain('brief-maquettes.pdf');
      expect(element().querySelector('.file small')?.textContent).toBe('240 Ko');

      await open('/agenda/events/week-end-mer');
      expect(facts()[0]).toBe('Du Samedi 24 octobre au Dimanche 25 octobre');
      expect(facts()[1]).toBe('Toute la journée');
      expect(element().textContent).toContain('Réserver le parking.');
    });

    describe('sharing', () => {
      const shareButton = () => element().querySelector('app-page-header .share') as HTMLButtonElement | null;
      const picker = () => element().querySelector('app-agenda-participants-picker') as HTMLElement | null;

      async function openPicker(): Promise<HTMLElement> {
        await open('/agenda/events/sport');
        shareButton()!.click();
        harness.detectChanges();
        http.expectOne('/api/v1/contacts').flush(CONTACTS);
        await settle();
        harness.detectChanges();
        return picker()!;
      }

      it('invites contacts from the event, saved at once with the rest of the event as it is', async () => {
        const before = store.event('sport')!;
        const list = await openPicker();
        expect(shareButton()!.getAttribute('aria-label')).toBe('Partager l’événement');
        const update = vi.spyOn(store, 'update');

        list.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[0].click();
        (list.querySelector('.confirm') as HTMLButtonElement).click();
        harness.detectChanges();

        expect(picker()).toBeNull();
        const request = http.expectOne(`${EVENTS_URL}/sport`);
        expect(request.request.method).toBe('PUT');
        const body = request.request.body as Record<string, unknown>;
        expect(body['participantIds']).toEqual([...before.participantIds, 'user-bob']);
        // The event's own fields, unchanged, and nothing of the view the API would refuse.
        expect(body).toMatchObject({ title: before.title, start: before.start, end: before.end, notes: before.notes });
        for (const extra of ['id', 'owner', 'mine', 'status', 'attendees']) expect(body).not.toHaveProperty(extra);
        expect(update).toHaveBeenCalledTimes(1);
        request.flush({
          ...before,
          participantIds: [...before.participantIds, 'user-bob'],
          attendees: [...before.attendees, { id: 'user-bob', name: 'Bob Test', avatarVersion: null, status: 'pending' }],
        });
        await settle();
        harness.detectChanges();

        expect(people()).toContain('Bob Test · En attente');
      });

      it('sends nothing when the picker is closed without confirming', async () => {
        const list = await openPicker();
        // Modal: what it covers is out of reach of the keyboard.
        const covered = () => ['app-page-header', '.content'].map((selector) => (element().querySelector(selector) as HTMLElement).inert);
        expect(covered()).toEqual([true, true]);

        (list.querySelector('header button') as HTMLButtonElement).click();
        harness.detectChanges();

        expect(picker()).toBeNull();
        expect(covered()).toEqual([false, false]);
        http.expectNone(`${EVENTS_URL}/sport`);
      });

      it('shows why the invitation did not go through', async () => {
        const list = await openPicker();
        (list.querySelector('.confirm') as HTMLButtonElement).click();
        http
          .expectOne(`${EVENTS_URL}/sport`)
          .flush({ errorCode: 'agenda.guestsMustBeContacts' }, { status: 400, statusText: 'Bad Request' });
        await settle();
        harness.detectChanges();

        expect(element().querySelector('[role="alert"]')?.textContent).toBe('Seuls vos contacts peuvent être invités.');
      });
    });

    it('confirms deletion in a modal, deletes it for everyone and returns to that day', async () => {
      await open('/agenda/events/sport?date=2026-10-22');
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      const remove = vi.spyOn(store, 'remove');

      (element().querySelector('.delete') as HTMLButtonElement).click();
      harness.detectChanges();
      TestBed.tick();
      const dialog = element().querySelector('dialog') as HTMLDialogElement;
      expect(dialog.open).toBe(true);
      expect(dialog.textContent).toContain('Toutes les occurrences');
      // Opening the modal is not the deletion.
      expect(remove).not.toHaveBeenCalled();

      (dialog.querySelector('.confirm') as HTMLButtonElement).click();
      expect(remove).toHaveBeenCalledTimes(1);
      expect(remove).toHaveBeenCalledWith('sport');
      // Nothing moves before the API agrees.
      expect(navigate).not.toHaveBeenCalled();
      const request = http.expectOne(`${EVENTS_URL}/sport`);
      expect(request.request.method).toBe('DELETE');
      request.flush(null, { status: 204, statusText: 'No Content' });
      await settle();

      expect(store.event('sport')).toBeUndefined();
      expect(navigate).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenCalledWith(['/agenda'], { queryParams: { date: '2026-10-22' }, replaceUrl: true });
    });

    it('warns that guests lose it too, and stays when the deletion fails', async () => {
      await open('/agenda/events/courses');
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
      (element().querySelector('.delete') as HTMLButtonElement).click();
      harness.detectChanges();
      expect(element().querySelector('dialog')?.textContent).toContain('agenda des participants');

      (element().querySelector('dialog .confirm') as HTMLButtonElement).click();
      http.expectOne(`${EVENTS_URL}/courses`).flush({ errorCode: 'agenda.organizerOnly' }, { status: 500, statusText: 'Error' });
      await settle();
      harness.detectChanges();

      expect(navigate).not.toHaveBeenCalled();
      expect(store.event('courses')).toBeDefined();
      expect(element().querySelector('.error')?.textContent).toBe('Seul l’organisateur peut modifier ou supprimer cet événement.');
    });

    it('can cancel the deletion', async () => {
      await open('/agenda/events/courses');
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
      const remove = vi.spyOn(store, 'remove');
      (element().querySelector('.delete') as HTMLButtonElement).click();
      harness.detectChanges();
      (element().querySelector('dialog .cancel') as HTMLButtonElement).click();
      harness.detectChanges();

      expect(remove).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
      http.expectNone((request) => request.method === 'DELETE');
      expect(store.event('courses')).toBeDefined();
      expect((element().querySelector('dialog') as HTMLDialogElement).open).toBe(false);
    });

    it('asks the API for an event it does not hold, and explains when it does not exist', async () => {
      const markViewed = vi.spyOn(store, 'markViewed');
      await harness.navigateByUrl('/agenda/events/inconnu');
      // Not "missing" before the API has answered.
      expect(element().querySelector('.missing')).toBeNull();

      http.expectOne(`${EVENTS_URL}/inconnu`).flush({ errorCode: 'agenda.eventNotFound' }, { status: 404, statusText: 'Not Found' });
      await settle();
      harness.detectChanges();

      expect(markViewed).not.toHaveBeenCalled();
      expect(element().querySelector('.missing')?.textContent).toContain('n’existe pas');
      expect(store.recent().map((event) => event.id)).not.toContain('inconnu');
    });
  });

  it('handles minimal events, unknown calendars and invalid dates', async () => {
    const lunch = seedAgendaEvents().find(({ id }) => id === 'dejeuner')!;
    await setUp([{ ...lunch, id: 'minimal', title: 'Minimal', calendarId: 'disparu', reminderMinutes: null }]);
    await open('/agenda/events/minimal?date=demain');

    // Invalid ?date= falls back to the event's own date.
    expect(facts()).toEqual(['Jeudi 15 octobre 2026', '12:30 – 13:30']);
    expect(rows()).toEqual(['Rappel Aucun', 'Calendrier Sans calendrier', 'Récurrence Jamais']);
    expect(element().querySelector('.text')).toBeNull();
    expect(element().querySelector('.file')).toBeNull();
  });

  describe('as a guest', () => {
    beforeEach(() => setUp([...seedAgendaEvents(), invitation()]));

    it('names the organiser and offers to accept or decline, never to edit', async () => {
      await open('/agenda/events/reunion-bob');

      expect(element().querySelector('.facts .organiser')?.textContent).toContain('Organisé par Bob Test');
      expect(element().querySelector('.answer p')?.textContent).toContain('Bob Test vous invite');
      expect(Array.from(element().querySelectorAll('.answer button'), (button) => button.textContent?.trim())).toEqual([
        'Refuser',
        'Accepter',
      ]);
      expect(element().querySelector('.content .actions')).toBeNull();
      // Only the organiser invites.
      expect(element().querySelector('app-page-header .share')).toBeNull();
      expect(await store.setParticipants('reunion-bob', ['user-bob'])).toBeNull();
      http.expectNone(`${EVENTS_URL}/reunion-bob`);
      // Their own calendar and reminder come with their answer.
      expect(rows()).toEqual(['Récurrence Jamais']);
      expect(people()).toEqual(['Bob Test · Organisateur', 'Vous · En attente']);
    });

    it('accepts, then shows they are coming', async () => {
      await open('/agenda/events/reunion-bob');

      (element().querySelector('.accept') as HTMLButtonElement).click();
      harness.detectChanges();
      expect((element().querySelector('.accept') as HTMLButtonElement).disabled).toBe(true);
      const request = http.expectOne(`${EVENTS_URL}/reunion-bob/response`);
      expect(request.request.body).toEqual(expect.objectContaining({ status: 'accepted', calendarId: 'personnel' }));
      request.flush(
        invitation({
          status: 'accepted',
          calendarId: 'personnel',
          reminderMinutes: 15,
          attendees: [{ id: 'me', name: 'Vous', avatarVersion: null, status: 'accepted' }],
        }),
      );
      await settle();
      harness.detectChanges();

      expect(element().querySelector('.answer p')?.textContent).toContain('Vous participez');
      expect(element().querySelector('.answer .link')?.textContent?.trim()).toBe('Ne plus participer');
      expect(rows()).toEqual(['Rappel 15 minutes avant', 'Calendrier Personnel', 'Récurrence Jamais']);
    });

    it('says why an answer did not go through, and keeps the choice open', async () => {
      await open('/agenda/events/reunion-bob');

      (element().querySelector('.decline') as HTMLButtonElement).click();
      http
        .expectOne(`${EVENTS_URL}/reunion-bob/response`)
        .flush({ errorCode: 'agenda.eventNotFound' }, { status: 404, statusText: 'Not Found' });
      await settle();
      harness.detectChanges();

      expect(element().querySelector('.error')?.textContent).toBe('Cet événement n’existe plus.');
      expect((element().querySelector('.decline') as HTMLButtonElement).disabled).toBe(false);
      expect(store.invitations().map(({ id }) => id)).toEqual(['reunion-bob']);
    });

    it('lets them change their mind on a declined invitation opened from a link', async () => {
      await harness.navigateByUrl('/agenda/events/refusee');
      http.expectOne(`${EVENTS_URL}/refusee`).flush(invitation({ id: 'refusee', status: 'declined' }));
      await settle();
      harness.detectChanges();

      expect(element().querySelector('.answer p')?.textContent).toContain('Vous avez refusé');
      (element().querySelector('.answer .link') as HTMLButtonElement).click();
      expect(http.expectOne(`${EVENTS_URL}/refusee/response`).request.body).toEqual(
        expect.objectContaining({ status: 'accepted' }),
      );
    });
  });
});
