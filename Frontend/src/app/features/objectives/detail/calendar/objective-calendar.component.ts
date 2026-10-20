import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { IsoDate, ObjectiveSession, ObjectiveSessionStatus } from '@plano/common';
import {
  formatDay,
  formatMonth,
  monthGrid,
  parseIsoDate,
} from '../../../../core/time/dates';
import { formatNumber } from '../../objective.utils';
import { ObjectivesStore } from '../../objectives.store';
import { ObjectiveContext } from '../objective-context';

export const SESSION_STATUS_LABELS: Readonly<Record<ObjectiveSessionStatus, string>> = {
  done: 'Réalisé',
  planned: 'Planifié',
  rest: 'Repos',
  missed: 'Manqué',
};

/** When a day has several sessions, the most meaningful one drives its marker. */
const STATUS_PRIORITY: readonly ObjectiveSessionStatus[] = ['done', 'missed', 'planned', 'rest'];

@Component({
  selector: 'app-objective-calendar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './objective-calendar.component.html',
  styleUrl: './objective-calendar.component.scss',
})
export class ObjectiveCalendarComponent {
  private readonly store = inject(ObjectivesStore);

  readonly objective = inject(ObjectiveContext).objective;
  readonly today = this.store.today();
  readonly weekdays = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const;
  readonly statuses = Object.entries(SESSION_STATUS_LABELS) as [ObjectiveSessionStatus, string][];
  readonly statusLabels = SESSION_STATUS_LABELS;
  readonly month = signal(this.monthOf(this.today));
  readonly selected = signal<IsoDate>(this.today);
  readonly formOpen = signal(false);
  readonly formError = signal('');

  readonly monthLabel = computed(() => formatMonth(this.month().year, this.month().month));
  readonly weeks = computed(() => monthGrid(this.month().year, this.month().month));
  private readonly sessionsByDate = computed(() => {
    const byDate = new Map<IsoDate, ObjectiveSession[]>();
    for (const session of this.objective()?.sessions ?? []) {
      byDate.set(session.date, [...(byDate.get(session.date) ?? []), session]);
    }
    return byDate;
  });
  readonly selectedSessions = computed(() => this.sessionsByDate().get(this.selected()) ?? []);
  readonly selectedLabel = computed(() =>
    this.selected() === this.today
      ? `Aujourd’hui – ${formatDay(this.selected())}`
      : formatDay(this.selected()),
  );

  dayStatus(date: IsoDate): ObjectiveSessionStatus | null {
    const sessions = this.sessionsByDate().get(date);
    if (!sessions) return null;
    return STATUS_PRIORITY.find((status) => sessions.some((session) => session.status === status)) ?? null;
  }

  dayLabel(date: IsoDate): string {
    const status = this.dayStatus(date);
    return status ? `${formatDay(date)} : ${SESSION_STATUS_LABELS[status]}` : formatDay(date);
  }

  shiftMonth(offset: number): void {
    this.month.update(({ year, month }) => {
      const next = new Date(year, month + offset, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }

  selectDay(date: IsoDate): void {
    this.selected.set(date);
    this.formOpen.set(false);
    const { year, month } = this.monthOf(date);
    if (year !== this.month().year || month !== this.month().month) this.month.set({ year, month });
  }

  formatValue(session: ObjectiveSession): string {
    return `${formatNumber(session.value)} ${this.objective()?.metric?.unit ?? ''}`;
  }

  defaultStatus(): ObjectiveSessionStatus {
    return this.selected() > this.today ? 'planned' : 'done';
  }

  addSession(label: string, value: number, duration: number, status: ObjectiveSessionStatus): void {
    const objective = this.objective();
    if (!objective) return;
    const counts = status === 'done' || status === 'planned';
    if (counts && !(value > 0)) {
      this.formError.set('Indiquez une valeur supérieure à 0.');
      return;
    }
    if (status === 'done' && this.selected() > this.today) {
      this.formError.set('Une séance future ne peut pas être déjà réalisée.');
      return;
    }
    this.store.addSession(objective.id, {
      date: this.selected(),
      status,
      label: label.trim() || SESSION_STATUS_LABELS[status],
      value: counts ? value : 0,
      ...(duration > 0 ? { durationMinutes: Math.round(duration) } : {}),
    });
    this.formError.set('');
    this.formOpen.set(false);
  }

  removeSession(sessionId: string): void {
    const objective = this.objective();
    if (objective) this.store.removeSession(objective.id, sessionId);
  }

  private monthOf(date: IsoDate): { year: number; month: number } {
    const parsed = parseIsoDate(date);
    return { year: parsed.getFullYear(), month: parsed.getMonth() };
  }
}
