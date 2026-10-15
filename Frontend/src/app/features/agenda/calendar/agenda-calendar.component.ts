import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { AgendaView, IsoDate } from '@plano/common';
import {
  addDays,
  formatLongDay,
  formatMonth,
  formatShortDate,
  isoWeekNumber,
  parseIsoDate,
  startOfWeek,
  toIsoDate,
} from '../../../core/time/dates';
import { BottomNavComponent } from '../../../shared/ui/bottom-nav.component';
import { AgendaStore } from '../agenda.store';
import { AgendaItem, coveredDates } from '../agenda.utils';
import { AgendaDayViewComponent, StripDay } from './agenda-day-view.component';
import { AgendaMonthViewComponent } from './agenda-month-view.component';
import { AgendaWeekViewComponent } from './agenda-week-view.component';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAY_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

/** Day, week and month views (screens 1–3). View and date live in the URL. */
@Component({
  selector: 'app-agenda-calendar',
  standalone: true,
  imports: [
    RouterLink,
    BottomNavComponent,
    AgendaDayViewComponent,
    AgendaWeekViewComponent,
    AgendaMonthViewComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './agenda-calendar.component.html',
  styleUrl: './agenda-calendar.component.scss',
})
export class AgendaCalendarComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly store = inject(AgendaStore);

  private readonly params = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  readonly views: readonly { value: AgendaView; label: string }[] = [
    { value: 'day', label: 'Jour' },
    { value: 'week', label: 'Semaine' },
    { value: 'month', label: 'Mois' },
  ];
  readonly today = this.store.today();
  readonly viewMenuOpen = signal(false);

  readonly view = computed<AgendaView>(() => {
    const view = this.params().get('view');
    return view === 'week' || view === 'month' ? view : 'day';
  });
  readonly date = computed<IsoDate>(() => {
    const date = this.params().get('date');
    return date && ISO_DATE.test(date) ? date : this.today;
  });
  readonly settings = this.store.settings;

  readonly weekDays = computed<StripDay[]>(() => {
    const first = startOfWeek(this.date(), this.settings().weekStartsOn);
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(first, index);
      return {
        date,
        weekday: WEEKDAY_SHORT[parseIsoDate(date).getDay()],
        day: parseIsoDate(date).getDate(),
        label: formatLongDay(date),
        isToday: date === this.today,
        colors: [...new Set((this.itemsByDate().get(date) ?? []).map((item) => item.color))].slice(0, 3),
      };
    });
  });

  /** Range loaded for the current view: the visible week, or the whole month grid. */
  private readonly range = computed(() => {
    const date = this.date();
    if (this.view() === 'month') {
      const first = startOfWeek(`${date.slice(0, 8)}01`, this.settings().weekStartsOn);
      return { from: first, to: addDays(first, 41) };
    }
    const first = startOfWeek(date, this.settings().weekStartsOn);
    return { from: first, to: addDays(first, 6) };
  });

  readonly itemsByDate = computed(() => {
    const byDate = new Map<IsoDate, AgendaItem[]>();
    const { from, to } = this.range();
    for (const item of this.store.itemsBetween(from, to)) {
      for (const date of coveredDates({ start: item.start, end: item.end })) {
        byDate.set(date, [...(byDate.get(date) ?? []), item]);
      }
    }
    return byDate;
  });
  readonly selectedItems = computed(() => this.itemsByDate().get(this.date()) ?? []);
  readonly weekNumber = computed(() =>
    this.settings().showWeekNumbers ? isoWeekNumber(this.weekDays()[3].date) : null,
  );

  readonly title = computed(() => {
    const date = this.date();
    switch (this.view()) {
      case 'day':
        return formatLongDay(date);
      case 'week': {
        const days = this.weekDays();
        return `${formatShortDate(days[0].date)} – ${formatShortDate(days[6].date)}`;
      }
      case 'month':
        return formatMonth(parseIsoDate(date).getFullYear(), parseIsoDate(date).getMonth());
    }
  });

  go(changes: { view?: AgendaView; date?: IsoDate }): void {
    this.viewMenuOpen.set(false);
    // replaceUrl: browsing dates should not fill the back-button history.
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { view: changes.view ?? this.view(), date: changes.date ?? this.date() },
      replaceUrl: true,
    });
  }

  shift(direction: 1 | -1): void {
    const date = this.date();
    if (this.view() === 'month') {
      const current = parseIsoDate(date);
      const target = new Date(current.getFullYear(), current.getMonth() + direction, 1);
      const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
      target.setDate(Math.min(current.getDate(), lastDay));
      this.go({ date: toIsoDate(target) });
      return;
    }
    this.go({ date: addDays(date, direction * (this.view() === 'week' ? 7 : 1)) });
  }

  openDatePicker(input: HTMLInputElement): void {
    try {
      input.showPicker();
    } catch {
      // Older browsers: focusing the input still lets the user type a date.
      input.focus();
    }
  }

  pickDate(value: string): void {
    if (ISO_DATE.test(value)) this.go({ date: value });
  }

  createAt(slot: { date: IsoDate; time: string }): void {
    void this.router.navigate(['/agenda/new'], { queryParams: slot });
  }
}
