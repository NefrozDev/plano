import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectivesStore } from '../../objectives.store';
import { provideObjectiveContext, provideObjectivesTesting } from '../../objectives.testing';
import { ObjectiveHabitComponent } from './objective-habit.component';

describe('ObjectiveHabitComponent', () => {
  let fixture: ComponentFixture<ObjectiveHabitComponent>;
  let component: ObjectiveHabitComponent;
  let element: HTMLElement;
  let store: ObjectivesStore;

  function setUp(id: string): void {
    TestBed.configureTestingModule({
      imports: [ObjectiveHabitComponent],
      providers: [...provideObjectivesTesting(), provideObjectiveContext(id)],
    });
    fixture = TestBed.createComponent(ObjectiveHabitComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    store = TestBed.inject(ObjectivesStore);
    fixture.detectChanges();
  }

  const day = (label: string): HTMLButtonElement =>
    element.querySelector(`.day[aria-label^="${label}"]`) as HTMLButtonElement;

  describe('for an ongoing habit', () => {
    beforeEach(() => setUp('mediter-30-min'));

    it('computes this month’s successes, rate and best streak', () => {
      expect(element.querySelector('.month-nav span')?.textContent).toBe('Octobre 2026');
      // 11 of the 15 days elapsed in October are checked in the seed.
      expect(component.stats()).toEqual({ successes: 11, rate: 73, bestStreak: 3 });
      expect(element.querySelectorAll('.day.checked').length).toBe(11);
    });

    it('disables future and padded days', () => {
      expect(day('Ven 16 octobre').disabled).toBeTrue();
      expect(day('Lun 28 septembre').disabled).toBeTrue();
      expect(day('Mer 14 octobre').disabled).toBeFalse();
    });

    it('toggles a day and recomputes the stats', () => {
      // 2 October is one of the skipped days in the seed.
      day('Ven 2 octobre').click();
      fixture.detectChanges();

      expect(day('Ven 2 octobre').getAttribute('aria-pressed')).toBe('true');
      expect(component.stats().successes).toBe(12);
    });

    it('browses previous months', () => {
      (element.querySelector('[aria-label="Mois précédent"]') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(element.querySelector('.month-nav span')?.textContent).toBe('Septembre 2026');
      expect(component.stats()).toEqual(jasmine.objectContaining({ successes: 23, rate: 77 }));

      component.shiftMonth(-1);
      // August is before the habit started: nothing can be tracked.
      expect(component.stats()).toEqual(jasmine.objectContaining({ successes: 0, rate: 0 }));
    });

    it('edits the reminder', () => {
      const select = element.querySelector('.reminder select') as HTMLSelectElement;
      const time = element.querySelector('.reminder input') as HTMLInputElement;
      time.value = '06:45';
      time.dispatchEvent(new Event('change'));
      select.value = 'none';
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      expect(store.find('mediter-30-min')?.reminder).toEqual(jasmine.objectContaining({ frequency: 'none', time: '06:45' }));
      expect(element.querySelector('.reminder input')).toBeNull();
    });

    it('locks check-ins while the habit is paused', () => {
      store.setPaused('mediter-30-min', true);
      fixture.detectChanges();

      expect(day('Mer 14 octobre').disabled).toBeTrue();
      expect(element.querySelector('.hint')?.textContent).toContain('Reprenez');
    });
  });

  it('opens a completed habit on its last tracked month', () => {
    setUp('mediter-30-jours');
    expect(element.querySelector('.month-nav span')?.textContent).toBe('Août 2026');
    expect(component.stats().successes).toBe(30);
  });

  it('ignores actions once the objective has been deleted', () => {
    setUp('mediter-30-min');
    store.remove('mediter-30-min');
    component.toggle('2026-10-14');
    component.updateReminder({ time: '10:00' });

    expect(component.isChecked('2026-10-14')).toBeFalse();
    expect(component.stats().successes).toBe(0);
  });

  it('explains that other objectives are not habits', () => {
    setUp('courir-10-km');
    expect(element.querySelector('.empty')).not.toBeNull();
  });
});
