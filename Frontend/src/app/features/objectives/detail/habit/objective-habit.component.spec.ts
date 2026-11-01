import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { ObjectiveCheckIn } from '@plano/common';
import {
  openObjective,
  provideObjectiveContext,
  provideObjectivesTesting,
  provideSignedIn,
  settleObjectives,
} from '../../objectives.testing';
import { ME, OTHER, habitDetail, metricDetail } from '../../testing/objectives-fixtures';
import { ObjectiveHabitComponent } from './objective-habit.component';

describe('ObjectiveHabitComponent', () => {
  let fixture: ComponentFixture<ObjectiveHabitComponent>;
  let component: ObjectiveHabitComponent;
  let element: HTMLElement;
  let http: HttpTestingController;

  async function setUp(detail = habitDetail()): Promise<void> {
    TestBed.configureTestingModule({
      imports: [ObjectiveHabitComponent],
      providers: [...provideObjectivesTesting(), provideObjectiveContext('obj-1'), provideSignedIn()],
    });
    http = TestBed.inject(HttpTestingController);
    await openObjective(detail);
    fixture = TestBed.createComponent(ObjectiveHabitComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  }

  const day = (label: string): HTMLButtonElement =>
    element.querySelector(`.day[aria-label^="${label}"]`) as HTMLButtonElement;

  afterEach(() => http.verify());

  describe('for an ongoing habit', () => {
    beforeEach(() => setUp());

    it('computes this month’s successes, rate and best streak', () => {
      expect(element.querySelector('.month-nav span')?.textContent).toBe('Octobre 2026');
      // Started on the 1st: 15 days could be tracked so far, 3 were.
      expect(component.stats()).toEqual({ successes: 3, rate: 20, bestStreak: 2 });
      expect(element.querySelectorAll('.day.checked').length).toBe(3);
    });

    it('disables future and padded days', () => {
      expect(day('Ven 16 octobre').disabled).toBe(true);
      expect(day('Lun 28 septembre').disabled).toBe(true);
      expect(day('Mer 14 octobre').disabled).toBe(false);
    });

    it('checks a free day', async () => {
      day('Ven 2 octobre').click();

      const request = http.expectOne('/api/v1/objectives/obj-1/check-ins/2026-10-02');
      expect(request.request.method).toBe('PUT');
      request.flush(habitDetail({ checkIns: [{ date: '2026-10-02', userId: ME }] }));
      await settleObjectives();
      fixture.detectChanges();

      expect(day('Ven 2 octobre').getAttribute('aria-pressed')).toBe('true');
      expect(component.stats().successes).toBe(1);
    });

    it('unchecks a checked day', async () => {
      day('Lun 5 octobre').click();

      const request = http.expectOne('/api/v1/objectives/obj-1/check-ins/2026-10-05');
      expect(request.request.method).toBe('DELETE');
      request.flush(habitDetail());
      await settleObjectives();
    });

    it('browses previous months', () => {
      (element.querySelector('[aria-label="Mois précédent"]') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(element.querySelector('.month-nav span')?.textContent).toBe('Septembre 2026');
      // Before the habit started: nothing can be tracked.
      expect(component.stats()).toEqual(expect.objectContaining({ successes: 0, rate: 0 }));
    });

    it('edits the signed-in person’s reminder', async () => {
      const time = element.querySelector('.reminder select') as HTMLSelectElement;
      time.value = 'daily';
      time.dispatchEvent(new Event('change'));

      const request = http.expectOne('/api/v1/objectives/obj-1/preferences');
      expect(request.request.method).toBe('PATCH');
      expect(request.request.body).toEqual({ reminder: { frequency: 'daily', time: '09:00', weekday: 0 } });
      request.flush(habitDetail({ reminder: { frequency: 'daily', time: '09:00', weekday: 0 } }));
      await settleObjectives();
      fixture.detectChanges();

      const input = element.querySelector('.reminder input') as HTMLInputElement;
      input.value = '06:45';
      input.dispatchEvent(new Event('change'));
      const second = http.expectOne('/api/v1/objectives/obj-1/preferences');
      expect(second.request.body).toEqual({ reminder: { frequency: 'daily', time: '06:45', weekday: 0 } });
      second.flush(habitDetail());
      await settleObjectives();
    });
  });

  it('only counts the signed-in person’s days', async () => {
    const checkIns: ObjectiveCheckIn[] = [
      { date: '2026-10-05', userId: ME },
      { date: '2026-10-05', userId: OTHER },
      { date: '2026-10-06', userId: OTHER },
    ];
    await setUp(habitDetail({ checkIns }));

    expect(component.stats().successes).toBe(1);
    expect(component.isChecked('2026-10-05')).toBe(true);
    expect(component.isChecked('2026-10-06')).toBe(false);
  });

  it('locks check-ins while the habit is paused', async () => {
    await setUp(habitDetail({ status: 'paused' }));

    expect(day('Mer 14 octobre').disabled).toBe(true);
    expect(element.querySelector('.hint')?.textContent).toContain('Reprenez');
  });

  it('only lets a viewer read', async () => {
    await setUp(habitDetail({ role: 'viewer' }));

    expect(day('Mer 14 octobre').disabled).toBe(true);
    expect(element.querySelector('.hint')?.textContent).toContain('sans y participer');
  });

  it('lets a contributor check in', async () => {
    await setUp(habitDetail({ role: 'contributor' }));

    expect(day('Mer 14 octobre').disabled).toBe(false);
  });

  it('opens a finished habit on its last tracked month', async () => {
    await setUp(habitDetail({ checkIns: [{ date: '2026-08-05', userId: ME }, { date: '2026-08-06', userId: ME }] }));

    expect(element.querySelector('.month-nav span')?.textContent).toBe('Août 2026');
  });

  it('explains that other objectives are not habits', async () => {
    await setUp(metricDetail());
    expect(element.querySelector('.empty')).not.toBeNull();
  });
});

describe('ObjectiveHabitComponent without an objective', () => {
  it('ignores actions', () => {
    TestBed.configureTestingModule({
      imports: [ObjectiveHabitComponent],
      providers: [...provideObjectivesTesting(), provideObjectiveContext('gone'), provideSignedIn()],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ObjectiveHabitComponent);
    fixture.detectChanges();

    fixture.componentInstance.toggle('2026-10-14');
    fixture.componentInstance.updateReminder({ time: '10:00' });

    http.verify();
    expect(fixture.componentInstance.isChecked('2026-10-14')).toBe(false);
    expect(fixture.componentInstance.stats().successes).toBe(0);
    expect(fixture.componentInstance.canContribute()).toBe(false);
  });
});
