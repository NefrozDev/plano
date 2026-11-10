import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import type { AgendaAttendeeStatus } from '@plano/common';
import { t } from '../../../core/i18n/translate';
import { readNotificationsWhileOpen } from '../../../core/notifications/notifications.store';
import { toPerson } from '../../../core/people/people';
import { formatLongDay, parseIsoDate } from '../../../core/time/dates';
import { ModalDialogComponent } from '../../../shared/ui/modal-dialog.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { UserAvatarComponent } from '../../../shared/ui/user-avatar.component';
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

/** Translation key of each guest's answer. */
const STATUS_LABELS: Readonly<Record<AgendaAttendeeStatus, string>> = {
  pending: 'agenda.status.pending',
  accepted: 'agenda.status.accepted',
  declined: 'agenda.status.declined',
};

/** Screen 4. `?date=` selects which occurrence of a recurring event is shown. */
@Component({
  selector: 'app-agenda-event-detail',
  imports: [RouterLink, TranslocoPipe, PageHeaderComponent, ModalDialogComponent, UserAvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './agenda-event-detail.component.html',
  styleUrl: './agenda-event-detail.component.scss',
})
export class AgendaEventDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly store = inject(AgendaStore);

  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  private readonly query = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  readonly id = computed(() => this.params().get('id') ?? '');
  readonly event = computed(() => this.store.event(this.id()));
  readonly deleteOpen = signal(false);
  /** An answer or a deletion is on its way. */
  readonly busy = signal(false);
  /** Looked for beyond the agenda (a declined invitation): only then is it missing. */
  readonly searched = signal(false);

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
    // The organiser first, then the guests with their answer.
    const people = event.attendees.length
      ? [
          { person: toPerson(event.owner), status: 'agenda.status.organiser', declined: false },
          ...event.attendees.map((attendee) => ({
            person: toPerson(attendee),
            status: STATUS_LABELS[attendee.status],
            declined: attendee.status === 'declined',
          })),
        ]
      : [];
    const calendar = this.store.calendar(event.calendarId);
    return {
      event,
      color: this.store.colorOf(event),
      dateLabel:
        start === end
          ? `${formatLongDay(start)} ${parseIsoDate(start).getFullYear()}`
          : t('agenda.detail.fromTo', { from: formatLongDay(start), to: formatLongDay(end) }),
      timeLabel: timeRangeLabel({ allDay: event.allDay, ...occurrence }, this.store.settings().hourFormat),
      people,
      organiser: toPerson(event.owner),
      reminder: eventReminderLabel(event.reminderMinutes),
      recurrence: t(RECURRENCE_LABELS[event.recurrence]),
      calendarName: calendar?.name ?? t('agenda.noCalendar'),
      calendarColor: calendar?.color ?? '#94a3b8',
      attachments: event.attachments.map((file) => ({ ...file, sizeLabel: formatFileSize(file.size) })),
    };
  });

  constructor() {
    this.store.error.set('');
    readNotificationsWhileOpen('agenda', () => (this.event() ? this.id() : ''));
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const id = params.get('id') ?? '';
      this.searched.set(false);
      void this.store.open(id).then((found) => {
        this.searched.set(true);
        if (found) this.store.markViewed(id);
      });
    });
  }

  async respond(status: 'accepted' | 'declined'): Promise<void> {
    this.busy.set(true);
    await this.store.respond(this.id(), status);
    this.busy.set(false);
  }

  async remove(): Promise<void> {
    const date = this.date();
    this.busy.set(true);
    const removed = await this.store.remove(this.id());
    this.busy.set(false);
    this.deleteOpen.set(false);
    if (removed) void this.router.navigate(['/agenda'], { queryParams: { date }, replaceUrl: true });
  }
}
