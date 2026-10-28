import type { Mock } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { providePlanoTesting } from '../../../testing/plano-testing';
import { AGENDA_ROUTES } from '../agenda.routes';
import { AgendaStore } from '../agenda.store';
import { AgendaEventFormComponent } from './agenda-event-form.component';

describe('AgendaEventFormComponent', () => {
  let harness: RouterTestingHarness;
  let store: AgendaStore;
  let navigate: Mock;

  const element = (): HTMLElement => harness.routeNativeElement as HTMLElement;
  const form = (): AgendaEventFormComponent =>
    harness.fixture.debugElement.query((node) => node.componentInstance instanceof AgendaEventFormComponent)
      .componentInstance as AgendaEventFormComponent;
  const submit = (): void => {
    (element().querySelector('#event-form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    harness.detectChanges();
  };
  const setInput = (selector: string, value: string, event = 'input'): void => {
    const input = element().querySelector(selector) as HTMLInputElement | HTMLSelectElement;
    input.value = value;
    input.dispatchEvent(new Event(event));
    harness.detectChanges();
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: providePlanoTesting([{ path: 'agenda', children: AGENDA_ROUTES }]),
    });
    store = TestBed.inject(AgendaStore);
    harness = await RouterTestingHarness.create();
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  describe('creating', () => {
    it('prefills the slot from the URL and the default duration and reminder', async () => {
      store.updateSettings({ defaultDurationMinutes: 90, defaultReminderMinutes: 30 });
      await harness.navigateByUrl('/agenda/new?date=2026-10-20&time=14:00');

      expect(form().form.getRawValue()).toEqual(
        expect.objectContaining({
          date: '2026-10-20',
          startTime: '14:00',
          endTime: '15:30',
          reminderMinutes: 30,
          calendarId: 'personnel',
        }),
      );
      expect(element().querySelector('h1')?.textContent).toBe('Nouvel événement');
    });

    it('picks the calendar from a dialog listing each calendar with its color', async () => {
      await harness.navigateByUrl('/agenda/new?date=2026-10-20');
      const row = element().querySelector('.calendar-row') as HTMLButtonElement;
      const dialog = element().querySelector('dialog') as HTMLDialogElement;
      expect(row.textContent).toContain('Personnel');
      expect(dialog.open).toBe(false);

      row.click();
      harness.detectChanges();
      expect(dialog.open).toBe(true);
      const options = Array.from(dialog.querySelectorAll<HTMLElement>('.calendar-option'));
      // A probe element turns each hex color into the rgb() form computed styles report.
      const probe = document.body.appendChild(document.createElement('i'));
      const rgb = (color: string): string => {
        probe.style.color = color;
        return getComputedStyle(probe).color;
      };
      expect(
        options.map((option) => ({
          name: option.textContent?.trim(),
          dot: getComputedStyle(option.querySelector('.dot') as HTMLElement).backgroundColor,
        })),
      ).toEqual(store.calendars().map((calendar) => ({ name: calendar.name, dot: rgb(calendar.color) })));
      probe.remove();

      options.find((option) => option.textContent?.trim() === 'Travail')!.querySelector('input')!.click();
      harness.detectChanges();
      expect(form().form.controls.calendarId.value).toBe('travail');
      expect(dialog.open).toBe(false);
      expect(row.textContent).toContain('Travail');
      expect(row.querySelector('.dot')).not.toBeNull();
    });

    it('lets free-text fields start on the left while date and time values stay on the right', async () => {
      await harness.navigateByUrl('/agenda/new?date=2026-10-20');
      const align = (selector: string): string =>
        getComputedStyle(element().querySelector(selector) as HTMLElement).textAlign;

      expect(align('input[formcontrolname="location"]')).toBe('left');
      expect(align('input[formcontrolname="date"]')).toBe('right');
      expect(align('input[formcontrolname="startTime"]')).toBe('right');
    });

    it('starts at the next full hour today and skips hidden calendars', async () => {
      store.toggleCalendar('personnel');
      await harness.navigateByUrl('/agenda/new');

      expect(form().form.getRawValue()).toEqual(
        expect.objectContaining({
          date: '2026-10-15',
          startTime: '11:00',
          endTime: '12:00',
          calendarId: 'travail',
        }),
      );
    });

    it('requires a title and an end after the start, then saves and opens the event', async () => {
      const create = vi.spyOn(store, 'create');
      const update = vi.spyOn(store, 'update');
      await harness.navigateByUrl('/agenda/new?date=2026-10-20&time=14:00');
      submit();
      expect(element().querySelector('.field-error')?.textContent).toContain('titre');

      setInput('input[formcontrolname="title"]', '  Atelier ');
      setInput('input[formcontrolname="endTime"]', '13:00');
      submit();
      expect(element().textContent).toContain('La fin doit être après le début.');
      // Invalid submissions neither save nor leave the form.
      expect(create).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();

      setInput('input[formcontrolname="endTime"]', '16:00');
      submit();
      expect(create).toHaveBeenCalledTimes(1);
      // The form hands over the raw title; the store trims it (see `created` below).
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ title: '  Atelier ', start: '2026-10-20T14:00', end: '2026-10-20T16:00' }),
      );
      expect(update).not.toHaveBeenCalled();
      const created = store.events().find((event) => event.title === 'Atelier');
      expect(created).toEqual(
        expect.objectContaining({ start: '2026-10-20T14:00', end: '2026-10-20T16:00' }),
      );
      expect(navigate).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenCalledWith(['/agenda/events', created!.id], {
        queryParams: { date: '2026-10-20' },
        replaceUrl: true,
      });
    });

    it('keeps the duration when the start time moves', async () => {
      await harness.navigateByUrl('/agenda/new?date=2026-10-20&time=14:00');
      setInput('input[formcontrolname="startTime"]', '16:30', 'input');
      (element().querySelector('input[formcontrolname="startTime"]') as HTMLInputElement).dispatchEvent(new Event('change'));

      expect(form().form.controls.endTime.value).toBe('17:30');

      // Near midnight the end is left alone rather than wrapping to the next day.
      setInput('input[formcontrolname="startTime"]', '23:30', 'input');
      (element().querySelector('input[formcontrolname="startTime"]') as HTMLInputElement).dispatchEvent(new Event('change'));
      expect(form().form.controls.endTime.value).toBe('17:30');
    });

    it('saves multi-day all-day events', async () => {
      await harness.navigateByUrl('/agenda/new?date=2026-11-01');
      setInput('input[formcontrolname="title"]', 'Vacances');
      (element().querySelector('input[formcontrolname="allDay"]') as HTMLInputElement).click();
      harness.detectChanges();
      setInput('input[formcontrolname="endDate"]', '2026-10-30');
      submit();
      expect(element().textContent).toContain('La fin doit être après le début.');
      expect(store.events().some((event) => event.title === 'Vacances')).toBe(false);
      expect(navigate).not.toHaveBeenCalled();

      setInput('input[formcontrolname="endDate"]', '2026-11-03');
      submit();
      const saved = store.events().find((event) => event.title === 'Vacances');
      expect(saved).toEqual(
        expect.objectContaining({
          allDay: true,
          start: '2026-11-01T00:00',
          end: '2026-11-03T23:59',
        }),
      );
      expect(navigate).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenCalledWith(['/agenda/events', saved!.id], {
        queryParams: { date: '2026-11-01' },
        replaceUrl: true,
      });
    });

    it('collects the step 2 options and rejects unsafe conference links', async () => {
      await harness.navigateByUrl('/agenda/new?date=2026-10-20&time=09:00');
      setInput('input[formcontrolname="title"]', 'Revue');
      (element().querySelector('.step-link') as HTMLButtonElement).click();
      harness.detectChanges();

      setInput('select[formcontrolname="recurrence"]', 'monthly', 'change');
      (element().querySelectorAll<HTMLInputElement>('.swatch input')[3]).click();
      setInput('input[formcontrolname="conferenceUrl"]', 'javascript:alert(1)');
      submit();
      expect(element().textContent).toContain('lien web');
      expect(store.events().some((event) => event.title === 'Revue')).toBe(false);
      expect(navigate).not.toHaveBeenCalled();

      setInput('input[formcontrolname="conferenceUrl"]', 'https://meet.example.com/revue');
      (element().querySelector('.step-link:not(.back)') as HTMLButtonElement).click();
      harness.detectChanges();
      setInput('select[formcontrolname="visibility"]', 'private', 'change');
      submit();

      expect(store.events().find((event) => event.title === 'Revue')).toEqual(
        expect.objectContaining({
          recurrence: 'monthly',
          color: '#8b5cf6',
          conferenceUrl: 'https://meet.example.com/revue',
          visibility: 'private',
        }),
      );
      expect(navigate).toHaveBeenCalledTimes(1);
    });

    it('sends the user back to step 1 when a main field is invalid', async () => {
      await harness.navigateByUrl('/agenda/new');
      const create = vi.spyOn(store, 'create');
      form().step.set(2);
      submit();

      expect(form().step()).toBe(1);
      expect(create).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('adds attachments as metadata, with size and count limits', async () => {
      await harness.navigateByUrl('/agenda/new');
      const component = form();
      const files = (list: File[]): HTMLInputElement =>
        ({ files: list, value: 'x' }) as unknown as HTMLInputElement;

      component.addAttachments(files([new File(['abc'], 'plan.pdf', { type: 'application/pdf' })]));
      expect(component.attachments()).toEqual([
        expect.objectContaining({ name: 'plan.pdf', size: 3 }),
      ]);

      const huge = new File(['x'], 'video.mp4');
      Object.defineProperty(huge, 'size', { value: 20 * 1024 * 1024 });
      component.addAttachments(files([huge]));
      expect(component.attachmentError()).toContain('10 Mo');
      expect(component.attachments().map(({ name }) => name)).toEqual(['plan.pdf']);

      component.addAttachments(files(Array.from({ length: 6 }, (_, index) => new File(['x'], `f${index}.txt`))));
      expect(component.attachments().length).toBe(5);
      expect(component.attachmentError()).toContain('5 pièces jointes');

      component.removeAttachment(component.attachments()[0].id);
      expect(component.attachments().length).toBe(4);
      expect(component.fileSize(2048)).toBe('2 Ko');
    });

    it('picks participants in the overlay', async () => {
      await harness.navigateByUrl('/agenda/new');
      (element().querySelector('.participants-row') as HTMLButtonElement).click();
      harness.detectChanges();
      const picker = element().querySelector('app-agenda-participants-picker') as HTMLElement;
      expect(Array.from(picker.querySelectorAll('h3')).map((title) => title.textContent)).toEqual([
        'Fréquemment contactés', 'Tous les contacts',
      ]);

      (picker.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[0]).click();
      (picker.querySelector('.confirm') as HTMLButtonElement).click();
      harness.detectChanges();

      expect(form().participantIds()).toEqual(['camille']);
      expect(element().querySelector('.participants-row .avatar')?.textContent).toBe('C');
    });
  });

  describe('editing', () => {
    it('prefills the form and updates the existing event', async () => {
      await harness.navigateByUrl('/agenda/events/courses/edit');

      expect(element().querySelector('h1')?.textContent).toBe('Modifier l’événement');
      expect(form().form.getRawValue()).toEqual(
        expect.objectContaining({
          title: 'Courses',
          date: '2026-10-15',
          startTime: '11:00',
          endTime: '12:00',
          location: 'Carrefour',
        }),
      );
      expect(form().participantIds()).toEqual(['alex']);

      const create = vi.spyOn(store, 'create');
      const update = vi.spyOn(store, 'update');
      setInput('input[formcontrolname="location"]', 'Marché');
      submit();
      expect(update).toHaveBeenCalledTimes(1);
      expect(update).toHaveBeenCalledWith('courses', expect.objectContaining({ location: 'Marché' }));
      expect(create).not.toHaveBeenCalled();
      expect(store.event('courses')?.location).toBe('Marché');
      expect(store.events().filter((event) => event.title === 'Courses').length).toBe(1);
      expect(navigate).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenCalledWith(['/agenda/events', 'courses'], {
        queryParams: { date: '2026-10-15' },
        replaceUrl: true,
      });
    });

    it('prefills all-day events with their end date', async () => {
      await harness.navigateByUrl('/agenda/events/week-end-mer/edit');
      expect(form().form.getRawValue()).toEqual(
        expect.objectContaining({ allDay: true, date: '2026-10-24', endDate: '2026-10-25' }),
      );
    });

    it('explains when the event to edit no longer exists', async () => {
      await harness.navigateByUrl('/agenda/events/inconnu/edit');

      expect(element().querySelector('.missing')).not.toBeNull();
      expect(element().querySelector('.save')).toBeNull();
      form().save();
      expect(navigate).not.toHaveBeenCalled();
    });
  });
});
