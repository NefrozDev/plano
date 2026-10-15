import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { AgendaContact } from '@plano/common';
import { formatLongDay, parseIsoDate } from '../../../core/time/dates';
import { AvatarStackComponent } from '../../../shared/ui/avatar-stack.component';
import { ModalDialogComponent } from '../../../shared/ui/modal-dialog.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { AgendaStore } from '../agenda.store';
import {
  RECURRENCE_LABELS,
  datePart,
  formatFileSize,
  occurrencesBetween,
  eventReminderLabel,
  timeRangeLabel,
} from '../agenda.utils';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Screen 4. `?date=` selects which occurrence of a recurring event is shown. */
@Component({
  selector: 'app-agenda-event-detail',
  standalone: true,
  imports: [RouterLink, PageHeaderComponent, ModalDialogComponent, AvatarStackComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './agenda-event-detail.component.html',
  styleUrl: './agenda-event-detail.component.scss',
})
export class AgendaEventDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly store = inject(AgendaStore);

  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  private readonly query = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  readonly id = computed(() => this.params().get('id') ?? '');
  readonly event = computed(() => this.store.event(this.id()));
  readonly deleteOpen = signal(false);

  /** Requested occurrence date, falling back to the next one. */
  readonly date = computed(() => {
    const requested = this.query().get('date');
    const event = this.event();
    if (requested && ISO_DATE.test(requested)) return requested;
    return event ? this.store.displayDate(event) : this.store.today();
  });

  readonly details = computed(() => {
    const event = this.event();
    if (!event) return null;
    const date = this.date();
    const occurrence =
      occurrencesBetween(event, date, date).find((candidate) => datePart(candidate.start) === date) ??
      { start: event.start, end: event.end };
    const start = datePart(occurrence.start);
    const end = datePart(occurrence.end);
    const people = event.participantIds
      .map((id) => this.store.contact(id))
      .filter((contact): contact is AgendaContact => !!contact);
    const calendar = this.store.calendar(event.calendarId);
    return {
      event,
      color: this.store.colorOf(event),
      dateLabel:
        start === end
          ? `${formatLongDay(start)} ${parseIsoDate(start).getFullYear()}`
          : `Du ${formatLongDay(start)} au ${formatLongDay(end)}`,
      timeLabel: timeRangeLabel({ allDay: event.allDay, ...occurrence }, this.store.settings().hourFormat),
      people,
      reminder: eventReminderLabel(event.reminderMinutes),
      recurrence: RECURRENCE_LABELS[event.recurrence],
      calendarName: calendar?.name ?? 'Sans calendrier',
      calendarColor: calendar?.color ?? '#94a3b8',
      attachments: event.attachments.map((file) => ({ ...file, sizeLabel: formatFileSize(file.size) })),
    };
  });

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const id = params.get('id') ?? '';
      if (this.store.event(id)) this.store.markViewed(id);
    });
  }

  remove(): void {
    const date = this.date();
    this.store.remove(this.id());
    this.deleteOpen.set(false);
    void this.router.navigate(['/agenda'], { queryParams: { date }, replaceUrl: true });
  }
}
