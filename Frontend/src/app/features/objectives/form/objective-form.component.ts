import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { t } from '../../../core/i18n/translate';
import type {
  CompletionMode,
  Contact,
  CreateObjectiveRequest,
  MetricAggregation,
  ObjectiveCategory,
  ObjectiveDetail,
  ObjectiveMemberRole,
  ObjectiveRecurrence,
  ObjectiveReminder,
  ObjectiveSettingsFields,
  UpdateObjectiveRequest,
} from '@plano/common';
import { firstValueFrom } from 'rxjs';
import { FriendsService } from '../../../core/friends/friends.service';
import { AutofocusDirective } from '../../../shared/ui/autofocus.directive';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { SwitchRowComponent } from '../../../shared/ui/switch-row.component';
import {
  COMPLETION_LABELS,
  OBJECTIVE_CATEGORIES,
  PERIOD_LABELS,
  RHYTHM_OPTIONS,
  weekdayNames,
} from '../objective.utils';
import { ObjectivesStore } from '../objectives.store';
import { ObjectiveIconComponent } from '../ui/objective-icon.component';
import { PeoplePickerComponent } from '../ui/people-picker.component';

type BarMode = Exclude<CompletionMode, 'none'>;

/** The most days a habit can have in one period: every day of it. */
const HABIT_MAX_DAYS: Readonly<Record<ObjectiveRecurrence, number>> = {
  none: 3660,
  weekly: 7,
  monthly: 31,
  yearly: 366,
};

function notBlank(control: AbstractControl<string>): ValidationErrors | null {
  return control.value.trim() ? null : { required: true };
}

/**
 * Creates or edits an objective, at any level: the name first, then a switch for
 * each option, which opens its settings when turned on.
 */
@Component({
  selector: 'app-objective-form',
  imports: [
    TranslocoPipe,
    ReactiveFormsModule,
    AutofocusDirective,
    PageHeaderComponent,
    ObjectiveIconComponent,
    PeoplePickerComponent,
    SwitchRowComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './objective-form.component.html',
  styleUrl: './objective-form.component.scss',
})
export class ObjectiveFormComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly friends = inject(FriendsService);
  readonly store = inject(ObjectivesStore);

  /** Set when editing an existing objective. */
  readonly objectiveId = this.route.snapshot.paramMap.get('id');
  /** Set when creating a sub-objective. */
  readonly parentId = this.route.snapshot.queryParamMap.get('parent');
  readonly categories = OBJECTIVE_CATEGORIES;
  readonly weekdays = computed(weekdayNames);
  readonly today = this.store.today();
  readonly barModes = Object.entries(COMPLETION_LABELS) as [BarMode, { label: string; hint: string }][];
  readonly backLink = this.objectiveId
    ? ['/objectives', this.objectiveId]
    : this.parentId
      ? ['/objectives', this.parentId]
      : ['/objectives'];

  readonly barOn = signal(false);
  readonly timelapseOn = signal(false);
  readonly childrenOn = signal(false);
  readonly sharedOn = signal(false);
  readonly commonOn = signal(false);
  readonly recurrenceOn = signal(false);
  readonly recurrence = signal<Exclude<ObjectiveRecurrence, 'none'>>('monthly');
  readonly recurrenceOptions: readonly { value: Exclude<ObjectiveRecurrence, 'none'>; label: string }[] = [
    { value: 'weekly', label: 'objectives.habit.weekly' },
    { value: 'monthly', label: 'objectives.form.monthly' },
    { value: 'yearly', label: 'objectives.form.yearly' },
  ];
  readonly rhythmOptions = RHYTHM_OPTIONS;
  /** The template picked to start from. */
  readonly templateId = signal('');
  /** The signed-in user's contacts; null until a sharing option is opened. */
  readonly contacts = signal<readonly Contact[] | null>(null);
  /** Who follows the objective, and who contributes to it. */
  readonly viewers = signal<readonly string[]>([]);
  readonly contributors = signal<readonly string[]>([]);
  readonly saving = signal(false);
  /** The objective being edited is not available. */
  readonly missing = signal(false);

  readonly form = this.formBuilder.nonNullable.group({
    title: ['', [notBlank, Validators.maxLength(80)]],
    category: ['health' as ObjectiveCategory],
    description: ['', Validators.maxLength(500)],
    plan: ['', Validators.maxLength(120)],
    completion: ['metric' as BarMode],
    target: [10, [Validators.required, Validators.min(0.1), Validators.max(1_000_000_000)]],
    unit: ['', [notBlank, Validators.maxLength(12)]],
    aggregation: ['sum' as MetricAggregation],
    habitTargetDays: [
      30,
      [
        Validators.required,
        Validators.min(1),
        (control: AbstractControl<number>) => (control.value > this.habitMaxDays() ? { max: true } : null),
      ],
    ],
    startDate: [this.store.today(), Validators.required],
    dueDate: [''],
    timelapse: ['elapsed' as 'elapsed' | 'remaining'],
    weight: [1, [Validators.required, Validators.min(1), Validators.max(100)]],
    children: this.formBuilder.nonNullable.array([this.formBuilder.nonNullable.control('', Validators.maxLength(80))]),
    reminderFrequency: ['none' as ObjectiveReminder['frequency']],
    reminderTime: ['09:00'],
    reminderWeekday: [0],
  });

  ngOnInit(): void {
    if (this.objectiveId) void this.loadForEditing(this.objectiveId);
    else if (this.parentId) void this.inheritFromParent(this.parentId);
    else void this.store.loadTemplates();
  }

  get heading(): string {
    if (this.objectiveId) return t('objectives.form.editHeading');
    return t(this.parentId ? 'objectives.form.newChild' : 'titles.newObjective');
  }

  /** Only a top-level objective repeats, and starts from a template. */
  isTopLevel(): boolean {
    return !this.parentId && !(this.objectiveId && this.store.detail()?.parentId);
  }

  /** Only a sub-objective has a share of its parent's bar. */
  showWeight(): boolean {
    return !!this.parentId || (!!this.objectiveId && !!this.store.detail()?.parentId);
  }

  /**
   * A count or a habit on a top-level objective gets its pace next to its target
   * ("2 days a week"): that pace is the objective's recurrence, so the separate
   * repeat option is not shown with it.
   */
  showRhythm(): boolean {
    const mode = this.form.controls.completion.value;
    return this.isTopLevel() && this.barOn() && (mode === 'metric' || mode === 'habit');
  }

  rhythm(): ObjectiveRecurrence {
    return this.recurrenceOn() ? this.recurrence() : 'none';
  }

  setRhythm(rhythm: ObjectiveRecurrence): void {
    this.recurrenceOn.set(rhythm !== 'none');
    if (rhythm !== 'none') this.recurrence.set(rhythm);
    const days = this.form.controls.habitTargetDays;
    if (days.value > this.habitMaxDays()) days.setValue(this.habitMaxDays());
    days.updateValueAndValidity();
  }

  /** "par semaine" after a target, empty when it is reached once. */
  perPeriod(): string {
    const rhythm = this.rhythm();
    return rhythm === 'none' ? '' : t(PERIOD_LABELS[rhythm].per);
  }

  everyPeriod(): string {
    const rhythm = this.rhythm();
    return rhythm === 'none' ? '' : t(PERIOD_LABELS[rhythm].every);
  }

  habitMaxDays(): number {
    return HABIT_MAX_DAYS[this.rhythm()];
  }

  showError(name:'title' | 'target' | 'unit' | 'habitTargetDays' | 'weight'): boolean {
    const control = this.form.controls[name];
    return control.invalid && control.touched;
  }

  /** A timelapse bar has nothing to measure without a deadline. */
  dueDateMissing(): boolean {
    return this.timelapseOn() && !this.form.controls.dueDate.value && this.form.controls.dueDate.touched;
  }

  dueDateTooEarly(): boolean {
    const { startDate, dueDate } = this.form.getRawValue();
    return !!dueDate && dueDate < startDate;
  }

  /** Editing may keep a deadline that has passed; a new objective cannot start with one. */
  dueDateInPast(): boolean {
    const { dueDate } = this.form.getRawValue();
    return !this.objectiveId && !!dueDate && dueDate < this.today;
  }

  async startFromTemplate(): Promise<void> {
    const templateId = this.templateId();
    if (!templateId || this.saving()) return;
    this.saving.set(true);
    const created = await this.store.useTemplate(templateId, this.today);
    this.saving.set(false);
    if (created) void this.router.navigate(['/objectives', created.id], { replaceUrl: true });
  }

  toggleBar(): void {
    this.barOn.update((on) => !on);
  }

  selectBarMode(mode: BarMode): void {
    this.form.controls.completion.setValue(mode);
    // A bar made of sub-objectives needs a place to name them.
    if (mode === 'children' && !this.objectiveId) this.childrenOn.set(true);
  }

  toggleSharing(role: ObjectiveMemberRole): void {
    const on = role === 'viewer' ? this.sharedOn : this.commonOn;
    on.update((value) => !value);
    if (on() && !this.contacts()) void this.loadContacts();
  }

  /** Someone either follows or contributes: picking one role takes them out of the other. */
  togglePerson(role: ObjectiveMemberRole, userId: string): void {
    const [picked, other] = role === 'viewer' ? [this.viewers, this.contributors] : [this.contributors, this.viewers];
    picked.update((ids) => (ids.includes(userId) ? ids.filter((id) => id !== userId) : [...ids, userId]));
    other.update((ids) => ids.filter((id) => id !== userId));
  }

  addChildField(): void {
    this.form.controls.children.push(this.formBuilder.nonNullable.control('', Validators.maxLength(80)));
  }

  removeChildField(index: number): void {
    if (this.form.controls.children.length > 1) this.form.controls.children.removeAt(index);
  }

  async submit(): Promise<void> {
    const controls = this.visibleControls();
    controls.forEach((control) => control.markAllAsTouched());
    this.form.controls.dueDate.markAsTouched();
    const invalid =
      controls.some((control) => control.invalid) ||
      this.dueDateTooEarly() ||
      this.dueDateInPast() ||
      (this.timelapseOn() && !this.form.controls.dueDate.value);
    if (invalid || this.saving()) return;

    this.saving.set(true);
    const objectiveId = await (this.objectiveId ? this.saveChanges(this.objectiveId) : this.createObjective());
    this.saving.set(false);
    if (objectiveId) void this.router.navigate(['/objectives', objectiveId], { replaceUrl: true });
  }

  /** The controls on screen: a switched-off option is not validated. */
  private visibleControls(): AbstractControl[] {
    const controls = this.form.controls;
    const visible: AbstractControl[] = [controls.title, controls.description, controls.plan, controls.startDate];
    if (this.showWeight()) visible.push(controls.weight);
    if (this.barOn() && controls.completion.value === 'metric') visible.push(controls.target, controls.unit);
    if (this.barOn() && controls.completion.value === 'habit') visible.push(controls.habitTargetDays);
    return visible;
  }

  private settings(): ObjectiveSettingsFields & { completion: CompletionMode } {
    const value = this.form.getRawValue();
    const completion: CompletionMode = this.barOn() ? value.completion : 'none';
    return {
      title: value.title.trim(),
      category: value.category,
      description: value.description.trim(),
      plan: value.plan.trim(),
      completion,
      startDate: value.startDate,
      dueDate: value.dueDate || null,
      timelapse: this.timelapseOn() ? value.timelapse : 'off',
      ...(this.isTopLevel() && { recurrence: this.recurrenceOn() ? this.recurrence() : 'none' }),
      ...(completion === 'metric' && {
        metric: { unit: value.unit.trim(), target: value.target, aggregation: value.aggregation },
      }),
      ...(completion === 'habit' && { habitTargetDays: value.habitTargetDays }),
    };
  }

  private async createObjective(): Promise<string | null> {
    const value = this.form.getRawValue();
    const children = this.childrenOn()
      ? value.children.map((title) => title.trim()).filter(Boolean)
      : [];
    const members = [
      ...(this.sharedOn() ? this.viewers().map((userId) => ({ userId, role: 'viewer' as const })) : []),
      ...(this.commonOn() ? this.contributors().map((userId) => ({ userId, role: 'contributor' as const })) : []),
    ];
    const details = {
      ...this.settings(),
      ...(this.parentId && { parentId: this.parentId, weight: value.weight }),
      ...(children.length && { children }),
      ...(members.length && { members }),
      reminder: { frequency: value.reminderFrequency, time: value.reminderTime, weekday: +value.reminderWeekday },
      dueReminder: this.store.settings().defaultDueReminder,
    } as CreateObjectiveRequest;
    const created = await this.store.create(details);
    if (!created) return null;
    // A sub-objective returns to its parent, ready for the next one.
    return this.parentId ?? created.id;
  }

  private async saveChanges(id: string): Promise<string | null> {
    const changes: UpdateObjectiveRequest = {
      ...this.settings(),
      ...(this.showWeight() && { weight: this.form.getRawValue().weight }),
    };
    return (await this.store.update(id, changes)) ? id : null;
  }

  private async loadContacts(): Promise<void> {
    try {
      this.contacts.set(await firstValueFrom(this.friends.contacts()));
    } catch {
      this.contacts.set([]);
    }
  }

  private async loadForEditing(id: string): Promise<void> {
    if (this.store.detail()?.id !== id && !(await this.store.open(id))) {
      this.missing.set(true);
      return;
    }
    const objective = this.store.detail();
    if (objective) this.fill(objective);
  }

  private fill(objective: ObjectiveDetail): void {
    this.barOn.set(objective.completion !== 'none');
    this.timelapseOn.set(objective.timelapse !== 'off');
    this.setRhythm(objective.recurrence);
    this.form.patchValue({
      title: objective.title,
      category: objective.category,
      description: objective.description,
      plan: objective.plan,
      ...(objective.completion !== 'none' && { completion: objective.completion }),
      ...(objective.metric && {
        target: objective.metric.target,
        unit: objective.metric.unit,
        aggregation: objective.metric.aggregation,
      }),
      ...(objective.habitTargetDays !== null && { habitTargetDays: objective.habitTargetDays }),
      startDate: objective.startDate,
      dueDate: objective.dueDate ?? '',
      ...(objective.timelapse !== 'off' && { timelapse: objective.timelapse }),
      weight: objective.weight,
    });
  }

  /** A sub-objective starts in its parent's category. */
  private async inheritFromParent(parentId: string): Promise<void> {
    if (this.store.detail()?.id !== parentId) await this.store.open(parentId);
    const parent = this.store.detail();
    if (parent?.id === parentId) this.form.controls.category.setValue(parent.category);
  }
}
