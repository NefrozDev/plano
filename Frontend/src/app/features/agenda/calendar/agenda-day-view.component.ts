import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AgendaSettings, IsoDate, LocalDateTime } from '@plano/common';
import { AgendaItem, datePart, formatTime, timePart } from '../agenda.utils';
import { AgendaItemCardComponent } from '../ui/agenda-item-card.component';

export interface StripDay {
  date: IsoDate;
  weekday: string;
  day: number;
  label: string;
  isToday: boolean;
  colors: string[];
}

type TimelineRow =
  | { kind: 'item'; key: string; time: string; item: AgendaItem }
  | { kind: 'now'; key: string; time: string };

@Component({
  selector: 'app-agenda-day-view',
  imports: [RouterLink, AgendaItemCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="strip" role="group" aria-label="Jours de la semaine">
      @for (day of days(); track day.date) {
        <button
          type="button"
          [class.selected]="day.date === date()"
          [class.today]="day.isToday"
          [attr.aria-pressed]="day.date === date()"
          [attr.aria-label]="day.label"
          (click)="selectDate.emit(day.date)"
        >
          <span>{{ day.weekday }}</span><b>{{ day.day }}</b>
          <i class="dots" aria-hidden="true">
            @for (color of day.colors; track $index) {<em [style.background]="color"></em>}
          </i>
        </button>
      }
    </div>

    <section class="timeline" aria-live="polite">
      @if (allDay().length) {
        <div class="row">
          <span class="time">Journée</span>
          <div class="stack">
            @for (item of allDay(); track item.key) {<app-agenda-item-card [item]="item" />}
          </div>
        </div>
      }
      @for (row of rows(); track row.key) {
        @if (row.kind === 'now') {
          <div class="now"><span class="time">{{ row.time }}</span><i aria-hidden="true"></i><span class="visually-hidden">Heure actuelle</span></div>
        } @else {
          <div class="row"><span class="time">{{ row.time }}</span><app-agenda-item-card [item]="row.item" /></div>
        }
      }
      @if (!items().length) {
        <p class="empty">
          Rien de prévu ce jour-là.
          <a routerLink="/agenda/new" [queryParams]="{ date: date() }">Ajouter un événement</a>
        </p>
      }
    </section>
  `,
  styles: `
    :host { display: block; }
    .strip { display: grid; grid-template-columns: repeat(7, 1fr); padding: .2rem .7rem .7rem; border-bottom: 1px solid #edf0f5; }
    .strip button { display: grid; gap: .2rem; justify-items: center; padding: .25rem 0; border: 0; background: transparent; color: #6b7385; cursor: pointer; font-size: .64rem; }
    .strip b { display: grid; width: 2rem; height: 2rem; place-items: center; border-radius: 50%; color: var(--color-text); font-size: .85rem; }
    .strip .today b { color: var(--color-primary); }
    .strip .selected b { background: var(--color-primary); color: white; }
    .dots { display: flex; gap: 2px; height: .3rem; }
    .dots em { width: .3rem; height: .3rem; border-radius: 50%; }
    .timeline { display: grid; gap: .55rem; padding: .9rem 1.1rem 7rem; }
    .row { display: grid; grid-template-columns: 2.9rem minmax(0, 1fr); gap: .5rem; align-items: start; }
    .stack { display: grid; gap: .4rem; }
    .time { padding-top: .55rem; color: #6b7385; font-size: .68rem; font-variant-numeric: tabular-nums; font-weight: 650; }
    .now { display: grid; grid-template-columns: 2.9rem 1fr; gap: .5rem; align-items: center; }
    .now .time { padding: 0; color: #e5484d; }
    .now i { position: relative; height: 2px; background: #e5484d; }
    .now i::before { position: absolute; top: -3px; left: -4px; width: 8px; height: 8px; border-radius: 50%; background: #e5484d; content: ''; }
    .empty { display: grid; gap: .4rem; margin: 2.5rem 0; color: var(--color-text-muted); font-size: .82rem; text-align: center; }
    .empty a { color: var(--color-primary); font-weight: 700; }
  `,
})
export class AgendaDayViewComponent {
  readonly date = input.required<IsoDate>();
  readonly days = input.required<readonly StripDay[]>();
  readonly items = input.required<readonly AgendaItem[]>();
  readonly now = input.required<LocalDateTime>();
  readonly hourFormat = input.required<AgendaSettings['hourFormat']>();
  readonly selectDate = output<IsoDate>();

  readonly allDay = computed(() => this.items().filter((item) => item.allDay));
  readonly rows = computed<TimelineRow[]>(() => {
    const date = this.date();
    const rows: TimelineRow[] = this.items()
      .filter((item) => !item.allDay)
      .map((item) => ({
        kind: 'item',
        key: item.key,
        // Multi-day events continuing from the previous day have no start today.
        time: datePart(item.start) < date ? 'Suite' : formatTime(timePart(item.start), this.hourFormat()),
        item,
      }));
    const now = this.now();
    if (datePart(now) === date) {
      const index = rows.findIndex((row) => row.kind === 'item' && row.item.start > now);
      const marker: TimelineRow = { kind: 'now', key: 'now', time: formatTime(timePart(now), this.hourFormat()) };
      rows.splice(index === -1 ? rows.length : index, 0, marker);
    }
    return rows;
  });
}
