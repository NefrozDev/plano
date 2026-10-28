import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import type { AgendaAttachment, AgendaCalendar, AgendaContact, EventRecurrence, IsoDate } from '@plano/common';
import { createId, hourTime } from '../../../core/time/dates';
import { AvatarStackComponent } from '../../../shared/ui/avatar-stack.component';
import { ModalDialogComponent } from '../../../shared/ui/modal-dialog.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { AgendaEventDraft, AgendaStore } from '../agenda.store';
import {
  EVENT_COLORS,
  RECURRENCE_LABELS,
  REMINDER_OPTIONS,
  addMinutes,
  datePart,
  formatFileSize,
  isSafeUrl,
  minutesOfDay,
  timePart,
  toLocalDateTime,
} from '../agenda.utils';
import { AgendaParticipantsPickerComponent } from './agenda-participants-picker.component';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

function notBlank(control: AbstractControl<string>): ValidationErrors | null {
  return control.value.trim() ? null : { required: true };
}

function webUrl(control: AbstractControl<string>): ValidationErrors | null {
  const value = control.value.trim();
  return !value || isSafeUrl(value) ? null : { url: true };
}

/** Screens 5–6, used both to create (`/agenda/new`) and to edit (`/agenda/events/:id/edit`). */
@Component({
  selector: 'app-agenda-event-form',
  imports: [
    ReactiveFormsModule,
    PageHeaderComponent,
    AvatarStackComponent,
    ModalDialogComponent,
    AgendaParticipantsPickerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './agenda-event-form.component.html',
  styleUrl: './agenda-event-form.component.scss',
})
export class AgendaEventFormComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly store = inject(AgendaStore);

  readonly editingId = this.route.snapshot.paramMap.get('id');
  private readonly editing = this.editingId ? this.store.event(this.editingId) : undefined;
  /** Editing an id that no longer exists (deleted, stale link). */
  readonly missing = !!this.editingId && !this.editing;

  readonly calendars = this.store.calendars;
  readonly recurrences = Object.entries(RECURRENCE_LABELS) as [EventRecurrence, string][];
  readonly reminders = REMINDER_OPTIONS;
  readonly colors = EVENT_COLORS;
  readonly step = signal<1 | 2>(1);
  readonly pickerOpen = signal(false);
  readonly calendarPickerOpen = signal(false);
  readonly advancedOpen = signal(false);
  readonly submitted = signal(false);
  readonly attachmentError = signal('');
  readonly participantIds = signal<string[]>(this.editing?.participantIds ?? []);
  readonly attachments = signal<AgendaAttachment[]>(this.editing?.attachments ?? []);

  readonly form = this.formBuilder.nonNullable.group(
    {
      title: ['', [notBlank, Validators.maxLength(120)]],
      allDay: [false],
      date: ['', Validators.required],
      endDate: [''],
      startTime: ['09:00'],
      endTime: ['10:00'],
      calendarId: [this.calendars()[0]?.id ?? ''],
      location: ['', Validators.maxLength(120)],
      description: ['', Validators.maxLength(500)],
      recurrence: ['none' as EventRecurrence],
      reminderMinutes: [this.store.settings().defaultReminderMinutes],
      color: [null as string | null],
      conferenceUrl: ['', [webUrl, Validators.maxLength(300)]],
      notes: ['', Validators.maxLength(1000)],
      availability: ['busy' as 'busy' | 'free'],
      visibility: ['default' as 'default' | 'private'],
    },
    { validators: (group) => this.chronology(group) },
  );

  readonly people = computed(() =>
    this.participantIds()
      .map((id) => this.store.contact(id))
      .filter((contact): contact is AgendaContact => !!contact),
  );
  readonly cancelLink = computed(() => (this.editingId ? ['/agenda/events', this.editingId] : ['/agenda']));
  readonly cancelParams = { date: '' };

  /** Start time before the last edit, to keep the duration when the start moves. */
  private lastStart = '09:00';

  constructor() {
    this.initialize();
    this.cancelParams.date = this.form.controls.date.value;
  }

  showError(name: 'title' | 'conferenceUrl'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || this.submitted());
  }

  chronologyError(): boolean {
    return this.form.hasError('chronology') && (this.submitted() || this.form.controls.endTime.touched);
  }

  /** Moving the start keeps the event's duration, as calendar apps usually do. */
  onStartTimeChange(): void {
    const { startTime, endTime } = this.form.getRawValue();
    if (!TIME.test(startTime) || !TIME.test(this.lastStart)) return;
    const duration = minutesOfDay(endTime) - minutesOfDay(this.lastStart);
    if (duration > 0) {
      const end = timePart(addMinutes(toLocalDateTime('2000-01-01', startTime), duration));
      // Never wrap past midnight: timed events stay within one day.
      if (minutesOfDay(end) > minutesOfDay(startTime)) this.form.controls.endTime.setValue(end);
    }
    this.lastStart = startTime;
  }

  selectedCalendar(): AgendaCalendar | undefined {
    return this.store.calendar(this.form.controls.calendarId.value);
  }

  setParticipants(ids: string[]): void {
    this.participantIds.set(ids);
    this.pickerOpen.set(false);
  }

  addAttachments(input: HTMLInputElement): void {
    this.attachmentError.set('');
    const files = Array.from(input.files ?? []);
    input.value = '';
    const accepted = files.filter((file) => file.size <= MAX_ATTACHMENT_BYTES);
    if (accepted.length < files.length) this.attachmentError.set('Les fichiers de plus de 10 Mo sont ignorés.');
    const room = MAX_ATTACHMENTS - this.attachments().length;
    if (accepted.length > room) this.attachmentError.set(`${MAX_ATTACHMENTS} pièces jointes maximum.`);
    this.attachments.update((current) => [
      ...current,
      ...accepted.slice(0, Math.max(0, room)).map((file) => ({
        id: createId('file'),
        name: file.name,
        size: file.size,
        type: file.type,
      })),
    ]);
  }

  removeAttachment(id: string): void {
    this.attachments.update((files) => files.filter((file) => file.id !== id));
  }

  fileSize(bytes: number): string {
    return formatFileSize(bytes);
  }

  save(): void {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      // Main fields live on step 1: show it if one of them is the problem.
      const stepOneInvalid = this.form.controls.title.invalid || this.form.hasError('chronology') || this.form.controls.date.invalid;
      if (stepOneInvalid) this.step.set(1);
      return;
    }
    const value = this.form.getRawValue();
    const draft: AgendaEventDraft = {
      title: value.title,
      calendarId: value.calendarId,
      allDay: value.allDay,
      start: toLocalDateTime(value.date, value.allDay ? '00:00' : value.startTime),
      end: value.allDay ? toLocalDateTime(value.endDate || value.date, '23:59') : toLocalDateTime(value.date, value.endTime),
      location: value.location.trim(),
      description: value.description.trim(),
      participantIds: this.participantIds(),
      recurrence: value.recurrence,
      reminderMinutes: value.reminderMinutes,
      color: value.color,
      conferenceUrl: value.conferenceUrl.trim(),
      attachments: this.attachments(),
      notes: value.notes.trim(),
      availability: value.availability,
      visibility: value.visibility,
    };
    if (this.missing) return;
    const id = this.editingId ?? this.store.create(draft).id;
    if (this.editingId) this.store.update(id, draft);
    void this.router.navigate(['/agenda/events', id], { queryParams: { date: value.date }, replaceUrl: true });
  }

  private chronology(group: AbstractControl): ValidationErrors | null {
    const { allDay, date, endDate, startTime, endTime } = group.getRawValue() as {
      allDay: boolean; date: string; endDate: string; startTime: string; endTime: string;
    };
    if (allDay) return endDate && endDate < date ? { chronology: true } : null;
    return minutesOfDay(endTime) > minutesOfDay(startTime) ? null : { chronology: true };
  }

  private initialize(): void {
    const event = this.editing;
    if (event) {
      this.form.patchValue({
        ...event,
        date: datePart(event.start),
        endDate: datePart(event.end),
        startTime: timePart(event.start),
        endTime: event.allDay ? '10:00' : timePart(event.end),
      });
      this.lastStart = this.form.controls.startTime.value;
      return;
    }
    const query = this.route.snapshot.queryParamMap;
    const today = this.store.today();
    const date: IsoDate = ISO_DATE.test(query.get('date') ?? '') ? query.get('date')! : today;
    const requested = query.get('time');
    const nextHour = hourTime(Math.min(23, Number(timePart(this.store.now()).slice(0, 2)) + 1));
    const start = requested && TIME.test(requested) ? requested : date === today ? nextHour : '09:00';
    const end = timePart(addMinutes(toLocalDateTime(date, start), this.store.settings().defaultDurationMinutes));
    const visibleCalendar = this.calendars().find(
      (calendar) => !this.store.filters().hiddenCalendarIds.includes(calendar.id),
    );
    this.form.patchValue({
      date,
      endDate: date,
      startTime: start,
      // An end past midnight would wrap: cap at 23:59 for a same-day event.
      endTime: minutesOfDay(end) > minutesOfDay(start) ? end : '23:59',
      calendarId: visibleCalendar?.id ?? this.form.controls.calendarId.value,
    });
    this.lastStart = start;
  }
}
