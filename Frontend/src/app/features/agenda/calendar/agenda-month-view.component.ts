import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import type { IsoDate } from '@plano/common';
import { tCount } from '../../../core/i18n/translate';
import { WeekStart, addDays, capitalize, formatDay, formatLongDay, formatShortWeekday, isoWeekNumber, monthGrid } from '../../../core/time/dates';
import { AgendaItem } from '../agenda.utils';
import { AgendaItemCardComponent } from '../ui/agenda-item-card.component';

/** A Monday: the week's day names come from the dates that follow it. */
const A_MONDAY = '2024-01-01';
const MAX_DOTS = 3;

@Component({
  selector: 'app-agenda-month-view',
  imports: [RouterLink, TranslocoPipe, AgendaItemCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="month" [class.with-weeks]="showWeekNumbers()">
      @if (showWeekNumbers()) {<span class="weekday" aria-hidden="true">{{ 'agenda.weekShort' | transloco }}</span>}
      @for (weekday of weekdays(); track weekday) {
        <span class="weekday" aria-hidden="true">{{ weekday }}</span>
      }
      @for (week of weeks(); track week.number + week.days[0].date) {
        @if (showWeekNumbers()) {<span class="week-number">{{ week.number }}</span>}
        @for (day of week.days; track day.date) {
          <button
            type="button"
            [class.outside]="!day.inMonth"
            [class.today]="day.date === today()"
            [class.selected]="day.date === selected()"
            [attr.aria-pressed]="day.date === selected()"
            [attr.aria-label]="day.label"
            (click)="selectDate.emit(day.date)"
          >
            <b>{{ day.day }}</b>
            <i aria-hidden="true">@for (color of day.colors; track $index) {<em [style.background]="color"></em>}</i>
          </button>
        }
      }
    </div>

    <section class="day-list" aria-live="polite">
      <h2>{{ selectedLabel() }}</h2>
      @for (item of selectedItems(); track item.key) {
        <app-agenda-item-card [item]="item" />
      } @empty {
        <p class="empty">
          {{ 'agenda.calendar.nothing' | transloco }}
          <a routerLink="/agenda/new" [queryParams]="{ date: selected() }">{{ 'agenda.calendar.add' | transloco }}</a>
        </p>
      }
    </section>
  `,
  styles: `
    :host { display: block; padding-bottom: 7rem; }
    .month { display: grid; grid-template-columns: repeat(7, 1fr); gap: .1rem 0; padding: .2rem .8rem .8rem; border-bottom: 1px solid #edf0f5; }
    .month.with-weeks { grid-template-columns: 1.4rem repeat(7, 1fr); }
    .weekday { padding: .3rem 0; color: var(--color-text-muted); font-size: .62rem; font-weight: 650; text-align: center; }
    .week-number { align-self: center; color: #a3abb9; font-size: .58rem; font-weight: 700; text-align: center; }
    button { display: grid; gap: .15rem; justify-items: center; padding: .2rem 0; border: 0; background: transparent; color: var(--color-text); cursor: pointer; }
    b { display: grid; width: 1.9rem; height: 1.9rem; place-items: center; border-radius: 50%; font-size: .8rem; font-weight: 650; }
    .outside { color: #c2c8d3; }
    .today b { color: var(--color-primary); }
    .selected b { background: var(--color-primary); color: white; }
    i { display: flex; gap: 2px; height: .3rem; }
    em { width: .3rem; height: .3rem; border-radius: 50%; }
    .day-list { display: grid; gap: .5rem; padding: .9rem 1.1rem; }
    h2 { margin: 0 0 .2rem; color: var(--color-primary); font-size: .82rem; }
    .empty { display: grid; gap: .35rem; margin: 1.5rem 0; color: var(--color-text-muted); font-size: .8rem; text-align: center; }
    .empty a { color: var(--color-primary); font-weight: 700; }
  `,
})
export class AgendaMonthViewComponent {
  readonly selected = input.required<IsoDate>();
  readonly today = input.required<IsoDate>();
  readonly weekStartsOn = input.required<WeekStart>();
  readonly showWeekNumbers = input(false);
  readonly itemsByDate = input.required<ReadonlyMap<IsoDate, AgendaItem[]>>();
  readonly selectedItems = input.required<readonly AgendaItem[]>();
  readonly selectDate = output<IsoDate>();

  readonly weekdays = computed(() =>
    Array.from({ length: 7 }, (_, index) => capitalize(formatShortWeekday(addDays(A_MONDAY, index + (this.weekStartsOn() === 1 ? 0 : -1))))),
  );
  readonly weeks = computed(() => {
    const [year, month] = this.selected().split('-').map(Number);
    return monthGrid(year, month - 1, this.weekStartsOn()).map((week) => ({
      // The ISO week is the one containing the Thursday, i.e. the 4th day from Monday.
      number: isoWeekNumber(week[this.weekStartsOn() === 1 ? 3 : 4].date),
      days: week.map((day) => {
        const items = this.itemsByDate().get(day.date) ?? [];
        const count = items.length;
        return {
          ...day,
          colors: [...new Set(items.map((item) => item.color))].slice(0, MAX_DOTS),
          label: count ? tCount('agenda.calendar.dayWithItems', count, { day: formatDay(day.date) }) : formatDay(day.date),
        };
      }),
    }));
  });
  readonly selectedLabel = computed(() => formatLongDay(this.selected()));
}
