import { Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PlanoDataStore } from '../../core/data/plano-data.store';
import { flushListReminders, providePlanoTesting, settle } from '../../testing/plano-testing';
import { AgendaStore } from './agenda.store';
import { AgendaFiltersComponent } from './filters/agenda-filters.component';
import { AgendaSearchComponent } from './search/agenda-search.component';
import { AgendaSettingsComponent } from './settings/agenda-settings.component';
import { AgendaItemCardComponent } from './ui/agenda-item-card.component';
import { AgendaWeekViewComponent } from './calendar/agenda-week-view.component';

/** Specs for the secondary agenda screens (filters, search, settings) and small views. */
describe('Agenda secondary screens', () => {
  let store: AgendaStore;

  function render<T>(component: Type<T>): { fixture: ComponentFixture<T>; element: HTMLElement } {
    const fixture = TestBed.createComponent(component);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: providePlanoTesting() });
    TestBed.inject(AgendaStore).loadTasks();
    flushListReminders();
    await settle();
    store = TestBed.inject(AgendaStore);
  });

  describe('filters (screen 8)', () => {
    it('hides calendars and item kinds, and resets everything', () => {
      const { fixture, element } = render(AgendaFiltersComponent);
      const checkboxes = element.querySelectorAll<HTMLInputElement>('.option input');
      expect(checkboxes.length).toBe(5);
      expect(Array.from(checkboxes).every((box) => box.checked)).toBeTrue();

      checkboxes[1].click();
      (element.querySelectorAll<HTMLButtonElement>('.switch-row')[1]).click();
      fixture.detectChanges();
      expect(store.filters()).toEqual(jasmine.objectContaining({ hiddenCalendarIds: ['travail'], showTasks: false }));
      expect(element.querySelectorAll('.switch-row')[1].getAttribute('aria-checked')).toBe('false');

      (element.querySelector('.reset') as HTMLButtonElement).click();
      expect(store.activeFilterCount()).toBe(0);
    });
  });

  describe('search (screen 9)', () => {
    it('lists recent events and suggestions before typing', () => {
      const { element } = render(AgendaSearchComponent);

      expect(Array.from(element.querySelectorAll('.result strong')).map((title) => title.textContent)).toEqual([
        'Rendez-vous projet', 'Courses', 'Anniversaire de Camille', 'Sport',
      ]);
      expect(element.querySelector('.result small')?.textContent).toBe('Jeu 15 octobre à 09:00');
      expect(element.querySelectorAll('.suggestion').length).toBe(3);
      expect(element.querySelectorAll('.suggestion')[1].getAttribute('href')).toBe('/agenda?view=week&date=2026-10-15');
    });

    it('turns the contact suggestion into a query and links results to their occurrence', () => {
      const { fixture, element } = render(AgendaSearchComponent);
      (element.querySelector('button.suggestion') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(fixture.componentInstance.query()).toBe('Camille');
      expect(element.querySelectorAll('.result').length).toBe(4);
      expect(element.querySelector('.result')?.getAttribute('href')).toBe('/agenda/events/rendez-vous-projet?date=2026-10-15');

      const input = element.querySelector('input') as HTMLInputElement;
      input.value = 'zzz';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(element.querySelector('.empty')?.textContent).toContain('« zzz »');
    });

    it('dates a past one-off event on its own day', () => {
      const { fixture, element } = render(AgendaSearchComponent);
      fixture.componentInstance.query.set('dentiste');
      fixture.detectChanges();

      expect(element.querySelector('.result small')?.textContent).toBe('Ven 9 octobre à 10:00');
    });

    it('only offers period suggestions when nobody is a frequent contact', () => {
      TestBed.inject(PlanoDataStore).update((data) => ({
        ...data,
        agenda: { ...data.agenda, contacts: data.agenda.contacts.map((contact) => ({ ...contact, frequent: false })) },
      }));
      const { element } = render(AgendaSearchComponent);

      expect(element.querySelectorAll('.suggestion').length).toBe(2);
      expect(element.querySelector('button.suggestion')).toBeNull();
    });
  });

  describe('settings (screen 10)', () => {
    it('updates every setting', () => {
      const { fixture, element } = render(AgendaSettingsComponent);
      const selects = element.querySelectorAll<HTMLSelectElement>('select');
      const choose = (index: number, value: string): void => {
        selects[index].value = value;
        selects[index].dispatchEvent(new Event('change'));
      };

      choose(0, '0');
      choose(1, '30');
      choose(2, 'Europe/London');
      choose(3, 'none');
      choose(4, '12h');
      element.querySelectorAll<HTMLButtonElement>('[role="switch"]').forEach((toggle) => toggle.click());
      fixture.detectChanges();

      expect(store.settings()).toEqual({
        weekStartsOn: 0,
        defaultDurationMinutes: 30,
        timeZone: 'Europe/London',
        defaultReminderMinutes: null,
        eventNotifications: false,
        invitationNotifications: false,
        showWeekNumbers: true,
        hourFormat: '12h',
      });

      choose(3, '60');
      choose(0, '1');
      choose(4, '24h');
      expect(store.settings()).toEqual(jasmine.objectContaining({ defaultReminderMinutes: 60, weekStartsOn: 1, hourFormat: '24h' }));
    });
  });

  describe('item card', () => {
    it('renders tasks with a check box and events with avatars', () => {
      const fixture = TestBed.createComponent(AgendaItemCardComponent);
      const [event, task] = [
        store.itemsOn('2026-10-15')[0],
        store.itemsOn('2026-10-15').find((item) => item.kind === 'task')!,
      ];
      fixture.componentRef.setInput('item', event);
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      expect(element.querySelector('small')?.textContent).toBe('09:00 – 10:30 · Salle de réunion');
      expect(element.querySelectorAll('.avatar').length).toBe(3);
      expect(element.querySelector('.avatar.more')?.textContent).toBe('+3');

      fixture.componentRef.setInput('item', { ...task, done: true });
      fixture.detectChanges();
      expect(element.querySelector('.card')?.classList).toContain('done');
      expect(element.querySelector('strong')?.textContent).toContain('Tâche : ');
      expect(element.querySelector('.avatars')).toBeNull();
    });
  });

  describe('week view', () => {
    it('creates on a free slot click but not on a click on an event', () => {
      const fixture = TestBed.createComponent(AgendaWeekViewComponent);
      const days = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'].map(
        (date, index) => ({ date, weekday: 'X', day: 12 + index, label: date, isToday: date === '2026-10-15', colors: [] }),
      );
      fixture.componentRef.setInput('days', days);
      fixture.componentRef.setInput('itemsByDate', new Map([['2026-10-15', store.itemsOn('2026-10-15')]]));
      fixture.componentRef.setInput('selected', '2026-10-15');
      fixture.componentRef.setInput('hourFormat', '12h');
      fixture.componentRef.setInput('weekNumber', 42);
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      const created: { date: string; time: string }[] = [];
      fixture.componentInstance.createAt.subscribe((slot) => created.push(slot));

      expect(element.querySelector('.corner')?.textContent).toBe('S42');
      expect(element.querySelector('.hours span')?.textContent).toBe('12:00 AM');
      const column = element.querySelectorAll<HTMLElement>('.column')[3];
      column.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      // ctrlKey keeps RouterLink from navigating, and preventDefault stops the browser from
      // opening the link in a new tab (which would background the test page).
      const block = column.querySelector('.block') as HTMLElement;
      block.addEventListener('click', (event) => event.preventDefault());
      block.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));

      expect(created).toEqual([{ date: '2026-10-15', time: '00:00' }]);
    });
  });

});
