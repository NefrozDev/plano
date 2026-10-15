import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectivesStore } from '../../objectives.store';
import { provideObjectiveContext, provideObjectivesTesting } from '../../objectives.testing';
import { ObjectiveCalendarComponent } from './objective-calendar.component';

describe('ObjectiveCalendarComponent', () => {
  let fixture: ComponentFixture<ObjectiveCalendarComponent>;
  let component: ObjectiveCalendarComponent;
  let element: HTMLElement;
  let store: ObjectivesStore;

  function setUp(id: string): void {
    TestBed.configureTestingModule({
      imports: [ObjectiveCalendarComponent],
      providers: [...provideObjectivesTesting(), provideObjectiveContext(id)],
    });
    fixture = TestBed.createComponent(ObjectiveCalendarComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    store = TestBed.inject(ObjectivesStore);
    fixture.detectChanges();
  }

  function submit(label: string, value: string, status: string, duration = ''): void {
    (element.querySelector('.add-session') as HTMLButtonElement | null)?.click();
    fixture.detectChanges();
    const inputs = element.querySelectorAll<HTMLInputElement>('.session-form input');
    inputs[0].value = label;
    inputs[1].value = value;
    inputs[2].value = duration;
    const select = element.querySelector('.session-form select') as HTMLSelectElement;
    select.value = status;
    (element.querySelector('.session-form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  describe('for a metric objective', () => {
    beforeEach(() => setUp('courir-10-km'));

    it('opens on the current month with today selected', () => {
      expect(element.querySelector('h2')?.textContent).toBe('Octobre 2026');
      expect(element.querySelector('.day.today.selected')?.textContent?.trim()).toBe('15');
      expect(element.querySelector('h3')?.textContent).toBe('Aujourd’hui – Jeu 15 octobre');
      expect(element.querySelector('.empty')).not.toBeNull();
      expect(element.querySelectorAll('.legend li').length).toBe(4);
    });

    it('marks each day with its most meaningful session status', () => {
      expect(component.dayStatus('2026-10-14')).toBe('done');
      expect(component.dayStatus('2026-10-10')).toBe('rest');
      expect(component.dayStatus('2026-10-17')).toBe('planned');
      expect(component.dayStatus('2026-10-16')).toBeNull();
      expect(component.dayLabel('2026-09-30')).toBe('Mer 30 septembre : Manqué');
      // The 30 September cell is visible in October's first week as a padded day.
      expect(element.querySelector('.day.outside .marker.missed')).not.toBeNull();
    });

    it('selects a day, listing its sessions, and follows it into another month', () => {
      component.selectDay('2026-10-14');
      fixture.detectChanges();
      expect(element.querySelector('.session strong')?.textContent).toBe('Sortie longue');
      expect(element.querySelector('.session b')?.textContent).toBe('6,5 km');

      component.selectDay('2026-09-30');
      fixture.detectChanges();
      expect(element.querySelector('h2')?.textContent).toBe('Septembre 2026');
      expect(element.querySelector('.session b')).toBeNull();
    });

    it('navigates between months', () => {
      (element.querySelector('[aria-label="Mois suivant"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(element.querySelector('h2')?.textContent).toBe('Novembre 2026');

      component.shiftMonth(-2);
      fixture.detectChanges();
      expect(element.querySelector('h2')?.textContent).toBe('Septembre 2026');
    });

    it('validates and logs sessions on the selected day', () => {
      submit('Test', '0', 'done');
      expect(element.querySelector('.field-error')?.textContent).toContain('supérieure à 0');

      submit('Footing', '7', 'done', '45');
      const added = store.find('courir-10-km')!.sessions.find((session) => session.date === '2026-10-15');
      expect(added).toEqual(jasmine.objectContaining({ label: 'Footing', value: 7, status: 'done', durationMinutes: 45 }));
      expect(store.find('courir-10-km')!.sessions.length).toBe(15);
      expect(element.querySelector('.session-form')).toBeNull();

      // Rest days carry no value and get a default label.
      component.selectDay('2026-10-16');
      submit('', '', 'rest');
      expect(store.find('courir-10-km')!.sessions.find((session) => session.date === '2026-10-16')?.label).toBe('Repos');
    });

    it('refuses to mark a future session as done and can cancel the form', () => {
      component.selectDay('2026-10-20');
      fixture.detectChanges();
      expect(component.defaultStatus()).toBe('planned');

      submit('Sortie', '5', 'done');
      expect(element.querySelector('.field-error')?.textContent).toContain('future');

      (element.querySelector('.secondary') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(element.querySelector('.session-form')).toBeNull();
    });

    it('removes a session', () => {
      component.selectDay('2026-10-14');
      fixture.detectChanges();
      (element.querySelector('.session button') as HTMLButtonElement).click();

      expect(store.find('courir-10-km')!.sessions.some((session) => session.id === 'run-11')).toBeFalse();
    });
  });

  it('ignores actions once the objective has been deleted', () => {
    setUp('courir-10-km');
    store.remove('courir-10-km');
    component.addSession('Fantôme', 5, 0, 'done');
    component.removeSession('run-1');

    expect(component.formatValue({ id: 's', date: '2026-10-15', status: 'done', value: 5, label: '' })).toBe('5 ');
    expect(component.dayStatus('2026-10-14')).toBeNull();
    expect(store.objectives().length).toBe(7);
  });

  it('explains that other tracking modes have no calendar', () => {
    setUp('apprendre-italien');
    expect(element.querySelector('.unavailable')).not.toBeNull();
    expect(element.querySelector('.calendar')).toBeNull();
  });
});
