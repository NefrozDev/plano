import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  openObjective,
  provideObjectiveContext,
  provideObjectivesTesting,
  provideSignedIn,
  settleObjectives,
} from '../../objectives.testing';
import { ME, OTHER, habitDetail, metricDetail } from '../../testing/objectives-fixtures';
import { ObjectiveCalendarComponent } from './objective-calendar.component';

describe('ObjectiveCalendarComponent', () => {
  let fixture: ComponentFixture<ObjectiveCalendarComponent>;
  let component: ObjectiveCalendarComponent;
  let element: HTMLElement;
  let http: HttpTestingController;

  async function setUp(detail = metricDetail()): Promise<void> {
    TestBed.configureTestingModule({
      imports: [ObjectiveCalendarComponent],
      providers: [...provideObjectivesTesting(), provideObjectiveContext('obj-1'), provideSignedIn()],
    });
    http = TestBed.inject(HttpTestingController);
    await openObjective(detail);
    fixture = TestBed.createComponent(ObjectiveCalendarComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  }

  function fill(label: string, value: string, status: string, duration = ''): void {
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

  afterEach(() => http.verify());

  describe('for a numeric objective', () => {
    beforeEach(() => setUp());

    it('opens on the current month with today selected', () => {
      expect(element.querySelector('h2')?.textContent).toBe('Octobre 2026');
      expect(element.querySelector('.day.today.selected')?.textContent?.trim()).toBe('15');
      expect(element.querySelector('h3')?.textContent).toBe('Aujourd’hui – Jeu 15 octobre');
      expect(element.querySelector('.empty')).not.toBeNull();
      expect(element.querySelectorAll('.legend li').length).toBe(4);
    });

    it('marks each day with its most meaningful session status', () => {
      expect(component.dayStatus('2026-10-14')).toBe('done');
      expect(component.dayStatus('2026-10-13')).toBe('missed');
      expect(component.dayStatus('2026-10-17')).toBe('planned');
      expect(component.dayStatus('2026-10-16')).toBeNull();
      expect(component.dayLabel('2026-10-13')).toBe('Mar 13 octobre : Manqué');
      expect(component.dayLabel('2026-10-16')).toBe('Ven 16 octobre');
    });

    it('selects a day, listing its sessions with who did them, and follows it into another month', () => {
      component.selectDay('2026-10-14');
      fixture.detectChanges();
      expect(element.querySelector('.session strong')?.textContent).toBe('Sortie longue');
      expect(element.querySelector('.session small')?.textContent).toContain('Réalisé');
      expect(element.querySelector('.session small')?.textContent).toContain('Ada Lovelace');
      expect(element.querySelector('.session b')?.textContent).toBe('6,5 km');

      component.selectDay('2026-09-30');
      fixture.detectChanges();
      expect(element.querySelector('h2')?.textContent).toBe('Septembre 2026');
      expect(element.querySelector('.session')).toBeNull();
    });

    it('navigates between months', () => {
      (element.querySelector('[aria-label="Mois suivant"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(element.querySelector('h2')?.textContent).toBe('Novembre 2026');

      component.shiftMonth(-2);
      fixture.detectChanges();
      expect(element.querySelector('h2')?.textContent).toBe('Septembre 2026');
    });

    it('refuses an empty value without calling the API', () => {
      fill('Test', '0', 'done');

      expect(element.querySelector('.field-error')?.textContent).toContain('supérieure à 0');
      http.expectNone('/api/v1/objectives/obj-1/sessions');
    });

    it('logs a session on the selected day, and closes the form', async () => {
      fill('  Footing ', '7', 'done', '45');

      const request = http.expectOne('/api/v1/objectives/obj-1/sessions');
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({
        date: '2026-10-15',
        status: 'done',
        label: 'Footing',
        value: 7,
        durationMinutes: 45,
      });
      request.flush(metricDetail());
      await settleObjectives();
      fixture.detectChanges();

      expect(element.querySelector('.session-form')).toBeNull();
    });

    it('gives a rest day no value and a default label', () => {
      component.selectDay('2026-10-16');
      fill('', '', 'rest');

      const request = http.expectOne('/api/v1/objectives/obj-1/sessions');
      expect(request.request.body).toEqual({ date: '2026-10-16', status: 'rest', label: 'Repos', value: 0 });
      request.flush(metricDetail());
    });

    it('keeps the form open when the API refuses', async () => {
      fill('Footing', '7', 'done');
      http.expectOne('/api/v1/objectives/obj-1/sessions').flush(null, { status: 500, statusText: 'Error' });
      await settleObjectives();
      fixture.detectChanges();

      expect(element.querySelector('.session-form')).not.toBeNull();
    });

    it('refuses to mark a future session as done and can cancel the form', () => {
      component.selectDay('2026-10-20');
      fixture.detectChanges();
      expect(component.defaultStatus()).toBe('planned');

      fill('Sortie', '5', 'done');
      expect(element.querySelector('.field-error')?.textContent).toContain('future');
      http.expectNone('/api/v1/objectives/obj-1/sessions');

      (element.querySelector('.secondary') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(element.querySelector('.session-form')).toBeNull();
    });

    it('removes a session', async () => {
      component.selectDay('2026-10-14');
      fixture.detectChanges();
      (element.querySelector('.session button') as HTMLButtonElement).click();

      const request = http.expectOne('/api/v1/objectives/obj-1/sessions/run-2');
      expect(request.request.method).toBe('DELETE');
      request.flush(metricDetail());
      await settleObjectives();
    });
  });

  describe('by role', () => {
    const session = (authorId: string) => ({
      id: 'mine-or-not',
      date: '2026-10-15',
      status: 'done' as const,
      label: 'Sortie',
      value: 1,
      durationMinutes: null,
      author: { id: authorId, name: authorId },
    });

    it('lets the owner remove anyone’s session', async () => {
      await setUp(metricDetail({ sessions: [session(OTHER)] }));
      expect(element.querySelector('.session button')).not.toBeNull();
    });

    it('lets a contributor add sessions and remove only their own', async () => {
      await setUp(metricDetail({ role: 'contributor', sessions: [session(ME), { ...session(OTHER), id: 'other' }] }));

      const sessions = element.querySelectorAll('.session');
      expect(sessions[0].querySelector('button')).not.toBeNull();
      expect(sessions[1].querySelector('button')).toBeNull();
      expect(element.querySelector('.add-session')).not.toBeNull();
    });

    it('only shows sessions to a viewer', async () => {
      await setUp(metricDetail({ role: 'viewer', sessions: [session(ME)] }));

      expect(element.querySelector('.session button')).toBeNull();
      expect(element.querySelector('.add-session')).toBeNull();
      expect(component.canRemove(session(ME))).toBe(false);
    });

    it('shows a session of a deleted account without a name', async () => {
      await setUp(metricDetail({ sessions: [{ ...session(ME), author: null }] }));

      expect(element.querySelector('.session small')?.textContent?.trim()).toBe('Réalisé');
    });
  });

  it('explains that other modes have no calendar', async () => {
    await setUp(habitDetail());
    expect(element.querySelector('.unavailable')).not.toBeNull();
    expect(element.querySelector('.calendar')).toBeNull();
  });
});

describe('ObjectiveCalendarComponent without an objective', () => {
  it('ignores actions', async () => {
    TestBed.configureTestingModule({
      imports: [ObjectiveCalendarComponent],
      providers: [...provideObjectivesTesting(), provideObjectiveContext('gone'), provideSignedIn()],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ObjectiveCalendarComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    await component.addSession('Fantôme', 5, 0, 'done');
    component.removeSession('run-1');

    http.verify();
    expect(component.dayStatus('2026-10-14')).toBeNull();
    expect(component.canContribute()).toBe(false);
    expect(
      component.formatValue({
        id: 's',
        date: '2026-10-15',
        status: 'done',
        value: 5,
        label: '',
        durationMinutes: null,
        author: null,
      }),
    ).toBe('5 ');
  });
});
