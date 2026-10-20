import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  input,
  output,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AgendaSettings, IsoDate } from '@plano/common';
import { hourTime } from '../../../core/time/dates';
import { AgendaItem, formatTime, layoutDay, timeRangeLabel } from '../agenda.utils';
import type { StripDay } from './agenda-day-view.component';

/** Pixel height of one hour in the grid. */
export const HOUR_HEIGHT = 44;
const FIRST_VISIBLE_HOUR = 7;

@Component({
  selector: 'app-agenda-week-view',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="head">
      <span class="corner">{{ weekNumber() ? 'S' + weekNumber() : '' }}</span>
      @for (day of days(); track day.date) {
        <button
          type="button"
          [class.today]="day.isToday"
          [class.selected]="day.date === selected()"
          [attr.aria-label]="'Voir le ' + day.label"
          (click)="openDay.emit(day.date)"
        ><span>{{ day.weekday }}</span><b>{{ day.day }}</b></button>
      }
    </div>

    @if (hasAllDay()) {
      <div class="all-day">
        <span class="corner">Jour</span>
        @for (column of columns(); track column.date) {
          <div class="cell">
            @for (item of column.allDay; track item.key) {
              <a class="chip" [routerLink]="item.link" [queryParams]="item.queryParams" [style.--c]="item.color">{{ item.title }}</a>
            }
          </div>
        }
      </div>
    }

    <div #scroller class="scroller">
      <div class="grid" [style.height.px]="hourHeight * 24">
        <div class="hours" aria-hidden="true">
          @for (hour of hourLabels(); track hour.value) {
            <span [style.top.px]="hour.value * hourHeight">{{ hour.label }}</span>
          }
        </div>
        @for (column of columns(); track column.date) {
          <!-- Clicking a free slot is a pointer shortcut: the "Créer un événement" button does the same from the keyboard. -->
          <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -->
          <div class="column" [class.today]="column.isToday" (click)="onColumnClick($event, column.date)">
            @for (block of column.blocks; track block.key) {
              <a
                class="block"
                [routerLink]="block.item.link"
                [queryParams]="block.item.queryParams"
                [style.top.px]="block.top"
                [style.height.px]="block.height"
                [style.left.%]="block.left"
                [style.width.%]="block.width"
                [style.--c]="block.item.color"
                [attr.aria-label]="block.label"
              >{{ block.item.title }}</a>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    :host { display: flex; flex: 1; min-height: 0; flex-direction: column; }
    .head, .all-day { display: grid; grid-template-columns: 2.6rem repeat(7, 1fr); padding: 0 .5rem; }
    .head { border-bottom: 1px solid #edf0f5; }
    .corner { align-self: center; color: #8a93a3; font-size: .6rem; font-weight: 700; text-align: center; }
    .head button { display: grid; gap: .15rem; justify-items: center; padding: .2rem 0 .45rem; border: 0; background: transparent; color: #6b7385; cursor: pointer; font-size: .6rem; }
    .head b { display: grid; width: 1.75rem; height: 1.75rem; place-items: center; border-radius: 50%; color: var(--color-text); font-size: .78rem; }
    .head .today b { color: var(--color-primary); }
    .head .selected b { background: var(--color-primary); color: white; }
    .all-day { padding-top: .3rem; padding-bottom: .3rem; border-bottom: 1px solid #edf0f5; }
    .cell { display: grid; gap: 2px; min-width: 0; padding: 0 1px; }
    .chip { overflow: hidden; padding: .1rem .2rem; border-radius: .25rem; background: color-mix(in srgb, var(--c) 18%, white); color: color-mix(in srgb, var(--c) 70%, #111827); font-size: .55rem; font-weight: 700; text-decoration: none; white-space: nowrap; }
    .scroller { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 .5rem 6.5rem; }
    .grid { position: relative; display: grid; grid-template-columns: 2.6rem repeat(7, 1fr); background: repeating-linear-gradient(to bottom, #edf0f5 0 1px, transparent 1px 44px); }
    .hours { position: relative; }
    .hours span { position: absolute; right: .35rem; color: #8a93a3; font-size: .58rem; font-variant-numeric: tabular-nums; transform: translateY(-50%); }
    .hours span:first-child { transform: none; }
    .column { position: relative; border-left: 1px solid #f1f3f7; cursor: copy; }
    .column.today { background: rgb(50 91 226 / 4%); }
    .block { position: absolute; z-index: 1; overflow: hidden; padding: .15rem .2rem; border-left: 2px solid var(--c); border-radius: .3rem; background: color-mix(in srgb, var(--c) 18%, white); box-shadow: 0 0 0 1px white; color: color-mix(in srgb, var(--c) 70%, #111827); cursor: pointer; font-size: .55rem; font-weight: 700; line-height: 1.2; text-decoration: none; }
  `,
})
export class AgendaWeekViewComponent {
  readonly days = input.required<readonly StripDay[]>();
  readonly itemsByDate = input.required<ReadonlyMap<IsoDate, AgendaItem[]>>();
  readonly selected = input.required<IsoDate>();
  readonly hourFormat = input.required<AgendaSettings['hourFormat']>();
  readonly weekNumber = input<number | null>(null);
  readonly openDay = output<IsoDate>();
  readonly createAt = output<{ date: IsoDate; time: string }>();

  readonly hourHeight = HOUR_HEIGHT;
  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');

  readonly hourLabels = computed(() =>
    Array.from({ length: 24 }, (_, value) => ({
      value,
      label: formatTime(hourTime(value), this.hourFormat()),
    })),
  );
  readonly columns = computed(() =>
    this.days().map((day) => {
      const items = this.itemsByDate().get(day.date) ?? [];
      return {
        date: day.date,
        isToday: day.isToday,
        allDay: items.filter((item) => item.allDay),
        blocks: layoutDay(items, day.date).map((block) => ({
          key: block.item.key,
          item: block.item,
          top: (block.top / 60) * HOUR_HEIGHT,
          height: Math.max(18, (block.height / 60) * HOUR_HEIGHT - 2),
          left: (block.column / block.columns) * 100,
          width: 100 / block.columns,
          label: `${block.item.title}, ${timeRangeLabel(block.item, this.hourFormat())}`,
        })),
      };
    }),
  );
  readonly hasAllDay = computed(() => this.columns().some((column) => column.allDay.length));

  constructor() {
    // Open on the morning rather than at midnight.
    afterNextRender(() => {
      this.scroller().nativeElement.scrollTop = FIRST_VISIBLE_HOUR * HOUR_HEIGHT;
    });
  }

  /** Clicking an empty slot starts a new event at that hour. */
  onColumnClick(event: MouseEvent, date: IsoDate): void {
    if (event.target !== event.currentTarget) return;
    const hour = Math.min(23, Math.max(0, Math.floor(event.offsetY / HOUR_HEIGHT)));
    this.createAt.emit({ date, time: hourTime(hour) });
  }
}
