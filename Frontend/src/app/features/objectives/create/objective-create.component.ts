import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import type { ObjectiveCategory, ObjectiveReminder, ObjectiveTracking } from '@plano/common';
import { OBJECTIVE_CATEGORIES, WEEKDAY_LABELS } from '../objective.utils';
import { ObjectivesStore } from '../objectives.store';
import { ObjectiveHeaderComponent } from '../ui/objective-header.component';
import { ObjectiveIconComponent } from '../ui/objective-icon.component';

type WizardStep = 1 | 2 | 3;

function notBlank(control: AbstractControl<string>): ValidationErrors | null {
  return control.value.trim() ? null : { required: true };
}

@Component({
  selector: 'app-objective-create',
  standalone: true,
  imports: [ReactiveFormsModule, ObjectiveHeaderComponent, ObjectiveIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './objective-create.component.html',
  styleUrl: './objective-create.component.scss',
})
export class ObjectiveCreateComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly store = inject(ObjectivesStore);

  readonly categories = OBJECTIVE_CATEGORIES;
  readonly weekdays = WEEKDAY_LABELS;
  readonly today = this.store.today();
  readonly trackingOptions: readonly { value: ObjectiveTracking; label: string; hint: string }[] = [
    { value: 'metric', label: 'Objectif chiffré', hint: 'Distance, montant, nombre de livres…' },
    { value: 'steps', label: 'Étapes', hint: 'Une liste d’étapes à cocher' },
    { value: 'habit', label: 'Habitude', hint: 'Un jour réussi à la fois' },
  ];
  readonly step = signal<WizardStep>(1);

  readonly form = this.formBuilder.nonNullable.group({
    title: ['', [notBlank, Validators.maxLength(80)]],
    category: ['health' as ObjectiveCategory],
    dueDate: [''],
    description: ['', Validators.maxLength(200)],
    plan: ['', Validators.maxLength(120)],
    tracking: ['metric' as ObjectiveTracking],
    target: [10, [Validators.required, Validators.min(0.1), Validators.max(1_000_000)]],
    unit: ['', [notBlank, Validators.maxLength(12)]],
    aggregation: ['max' as 'sum' | 'max'],
    steps: this.formBuilder.nonNullable.array([this.formBuilder.nonNullable.control('', Validators.maxLength(80))]),
    habitTargetDays: [30, [Validators.required, Validators.min(1), Validators.max(366)]],
    reminderFrequency: ['none' as ObjectiveReminder['frequency']],
    reminderTime: ['09:00'],
    reminderWeekday: [0],
  });

  /** Controls validated before leaving each step. */
  private stepControls(step: WizardStep): AbstractControl[] {
    const controls = this.form.controls;
    if (step === 1) return [controls.title];
    if (step === 2) return [controls.dueDate, controls.description, controls.plan];
    switch (controls.tracking.value) {
      case 'metric':
        return [controls.target, controls.unit];
      case 'steps':
        return [controls.steps];
      case 'habit':
        return [controls.habitTargetDays];
    }
  }

  showError(name: 'title' | 'target' | 'unit' | 'habitTargetDays' | 'description'): boolean {
    const control = this.form.controls[name];
    return control.invalid && control.touched;
  }

  dueDateInPast(): boolean {
    const value = this.form.controls.dueDate.value;
    return !!value && value < this.today;
  }

  stepsMissing(): boolean {
    const steps = this.form.controls.steps;
    return steps.touched && !steps.value.some((label) => label.trim());
  }

  next(): void {
    const current = this.step();
    const controls = this.stepControls(current);
    controls.forEach((control) => control.markAllAsTouched());
    const invalid =
      controls.some((control) => control.invalid) ||
      (current === 2 && this.dueDateInPast()) ||
      (current === 3 && this.form.controls.tracking.value === 'steps' && this.stepsMissing());
    if (invalid) return;
    if (current < 3) {
      this.step.set((current + 1) as WizardStep);
      return;
    }
    this.create();
  }

  back(): void {
    this.step.update((step) => Math.max(1, step - 1) as WizardStep);
  }

  addStepField(): void {
    this.form.controls.steps.push(this.formBuilder.nonNullable.control('', Validators.maxLength(80)));
  }

  removeStepField(index: number): void {
    if (this.form.controls.steps.length > 1) this.form.controls.steps.removeAt(index);
  }

  private create(): void {
    const value = this.form.getRawValue();
    const objective = this.store.create({
      title: value.title,
      category: value.category,
      tracking: value.tracking,
      dueDate: value.dueDate || null,
      description: value.description,
      plan: value.plan,
      reminder: { frequency: value.reminderFrequency, time: value.reminderTime, weekday: +value.reminderWeekday },
      metric: { unit: value.unit.trim(), target: value.target, aggregation: value.aggregation },
      steps: value.steps,
      habitTargetDays: value.habitTargetDays,
    });
    void this.router.navigate(['/objectives', objective.id], { replaceUrl: true });
  }
}
