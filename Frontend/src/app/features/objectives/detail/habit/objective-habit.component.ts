import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { IsoDate, ObjectiveReminder } from '@plano/common';
import {
  daysBetween,
  formatDay,
  formatMonth,
  monthGrid,
  parseIsoDate,
  toIsoDate,
} from '../../../../core/time/dates';
import { longestStreak } from '../../objective.utils';
import { ObjectivesStore } from '../../objectives.store';
import { ObjectiveContext } from '../objective-context';

@Component({
  selector: 'app-objective-habit',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './objective-habit.component.html',
  styleUrl: './objective-habit.component.scss',
})
export class ObjectiveHabitComponent {
  private readonly store = inject(ObjectivesStore);

  readonly objective = inject(ObjectiveContext).objective;
  readonly today = this.store.today();
  readonly weekdays = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const;

  /** The signed-in person's own days: everyone checks in for themselves. */
  private readonly checkIns = computed(() => {
    const me = this.store.currentUserId();
    return new Set(
      (this.objective()?.checkIns ?? []).filter(({ userId }) => userId === me).map(({ date }) => date),
    );
  });
  readonly canContribute = computed(() => {
    const role = this.objective()?.role;
    return role === 'owner' || role === 'contributor';
  });

  readonly month = signal(this.initialMonth());
  readonly monthLabel = computed(() => formatMonth(this.month().year, this.month().month));
  readonly weeks = computed(() => monthGrid(this.month().year, this.month().month));

  readonly stats = computed(() => {
    const objective = this.objective();
    const { year, month } = this.month();
    const monthStart = toIsoDate(new Date(year, month, 1));
    const monthEnd = toIsoDate(new Date(year, month + 1, 0));
    const successes = [...this.checkIns()].filter((date) => date >= monthStart && date <= monthEnd).length;
    // Only days the habit could actually be tracked count towards the rate.
    const startDate = objective?.startDate ?? monthStart;
    const from = startDate > monthStart ? startDate : monthStart;
    const to = this.today < monthEnd ? this.today : monthEnd;
    const trackedDays = Math.max(0, daysBetween(from, to) + 1);
    return {
      successes,
      rate: trackedDays ? Math.min(100, Math.round((successes / trackedDays) * 100)) : 0,
      bestStreak: longestStreak([...this.checkIns()]),
    };
  });

  isChecked(date: IsoDate): boolean {
    return this.checkIns().has(date);
  }

  dayLabel(date: IsoDate): string {
    return `${formatDay(date)} : ${this.isChecked(date) ? 'réussi' : 'non fait'}`;
  }

  shiftMonth(offset: number): void {
    this.month.update(({ year, month }) => {
      const next = new Date(year, month + offset, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }

  toggle(date: IsoDate): void {
    const objective = this.objective();
    if (objective) void this.store.setCheckIn(objective.id, date, !this.isChecked(date));
  }

  updateReminder(changes: Partial<ObjectiveReminder>): void {
    const objective = this.objective();
    if (objective) {
      void this.store.updatePreferences(objective.id, { reminder: { ...objective.reminder, ...changes } });
    }
  }

  /** Completed habits open on their last tracked month rather than an empty current one. */
  private initialMonth(): { year: number; month: number } {
    const last = [...this.checkIns()].sort().at(-1);
    const reference = parseIsoDate(last && last < this.today.slice(0, 7) ? last : this.today);
    return { year: reference.getFullYear(), month: reference.getMonth() };
  }
}
