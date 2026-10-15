import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ObjectivesStore } from '../objectives.store';
import { provideObjectivesTesting } from '../objectives.testing';
import { ObjectiveCreateComponent } from './objective-create.component';

describe('ObjectiveCreateComponent', () => {
  let fixture: ComponentFixture<ObjectiveCreateComponent>;
  let component: ObjectiveCreateComponent;
  let element: HTMLElement;
  let navigate: jasmine.Spy;

  const submit = (): void => {
    (element.querySelector('.primary-button') as HTMLButtonElement).click();
    fixture.detectChanges();
  };
  const error = (): string => element.querySelector('.field-error')?.textContent?.trim() ?? '';

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ObjectiveCreateComponent],
      providers: provideObjectivesTesting(),
    });
    fixture = TestBed.createComponent(ObjectiveCreateComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    fixture.detectChanges();
  });

  /** Fills steps 1 and 2 so tests can focus on step 3. */
  function reachTrackingStep(title = 'Courir un semi'): void {
    component.form.patchValue({ title, category: 'health' });
    submit();
    submit();
  }

  it('requires a non-blank title before leaving step 1', () => {
    component.form.controls.title.setValue('   ');
    submit();

    expect(component.step()).toBe(1);
    expect(error()).toBe('Donnez un nom à votre objectif.');
  });

  it('selects a category through accessible radio buttons', () => {
    const finance = element.querySelectorAll<HTMLInputElement>('.categories input')[2];
    finance.click();
    fixture.detectChanges();

    expect(component.form.controls.category.value).toBe('finance');
    expect(finance.closest('label')?.classList).toContain('selected');
  });

  it('rejects a due date in the past and counts description characters', () => {
    component.form.controls.title.setValue('Lire');
    submit();
    expect(component.step()).toBe(2);

    component.form.patchValue({ dueDate: '2026-10-01', description: 'Un livre par mois' });
    submit();
    expect(component.step()).toBe(2);
    expect(error()).toContain('passé');
    expect(element.querySelector('.counter')?.textContent).toBe('17/200');

    component.form.controls.dueDate.setValue('2026-12-31');
    submit();
    expect(component.step()).toBe(3);

    (element.querySelector('.secondary') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(component.step()).toBe(2);
  });

  it('creates a metric objective and opens it', () => {
    reachTrackingStep();
    submit();
    expect(error()).toBe('Indiquez une cible positive et une unité.');

    component.form.patchValue({ target: 21, unit: ' km ', aggregation: 'max', reminderWeekday: 5 });
    // Use the DOM: an OnPush view only re-renders after template events, not programmatic patches.
    const frequency = element.querySelectorAll('select')[1];
    frequency.value = 'weekly';
    frequency.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(element.querySelectorAll('select').length).toBe(3);
    submit();

    const created = TestBed.inject(ObjectivesStore).find('courir-un-semi');
    expect(created).toEqual(jasmine.objectContaining({
      tracking: 'metric',
      dueDate: null,
      reminder: { frequency: 'weekly', time: '09:00', weekday: 5 },
    }));
    expect(created?.metric).toEqual({ unit: 'km', target: 21, aggregation: 'max', sessionsTarget: 0 });
    expect(navigate).toHaveBeenCalledWith(['/objectives', 'courir-un-semi'], { replaceUrl: true });
  });

  it('creates a steps objective with at least one step', () => {
    reachTrackingStep('Apprendre le piano');
    component.form.controls.tracking.setValue('steps');
    fixture.detectChanges();
    submit();
    expect(error()).toBe('Ajoutez au moins une étape.');

    component.addStepField();
    component.form.controls.steps.setValue(['Lire une partition', 'Jouer une gamme']);
    component.removeStepField(1);
    component.removeStepField(0);
    // The last remaining field can never be removed.
    expect(component.form.controls.steps.length).toBe(1);
    submit();

    expect(TestBed.inject(ObjectivesStore).find('apprendre-le-piano')?.steps.map((step) => step.label))
      .toEqual(['Lire une partition']);
  });

  it('creates a habit objective with a valid number of days', () => {
    reachTrackingStep('Marcher');
    component.form.patchValue({ tracking: 'habit', habitTargetDays: 0 });
    fixture.detectChanges();
    submit();
    expect(error()).toBe('Choisissez entre 1 et 366 jours.');

    component.form.controls.habitTargetDays.setValue(21);
    submit();
    expect(TestBed.inject(ObjectivesStore).find('marcher')?.habit).toEqual({ targetDays: 21, checkIns: [] });
  });
});
