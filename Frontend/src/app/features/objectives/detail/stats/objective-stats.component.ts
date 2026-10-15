import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { IsoDate, Objective } from '@plano/common';
import { daysBetween, formatDate, formatShortDate } from '../../../../core/time/dates';
import {
  formatDuration,
  formatNumber,
  metricCurrent,
  objectiveTint,
} from '../../objective.utils';
import { ObjectivesStore } from '../../objectives.store';
import { ObjectiveContext } from '../objective-context';

/** SVG user units; the chart scales uniformly to the container width. */
const WIDTH = 320;
const HEIGHT = 180;
const PADDING = { top: 16, right: 16, bottom: 26, left: 34 };

export interface ProgressPoint {
  date: IsoDate;
  /** Progress after this session: running max or running total. */
  value: number;
  x: number;
  y: number;
}

/** Tick step of 1, 2, 2.5 or 5 × 10ⁿ giving about four intervals. */
export function niceStep(max: number, intervals = 4): number {
  if (max <= 0) return 1;
  const raw = max / intervals;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return factor * magnitude;
}

@Component({
  selector: 'app-objective-stats',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './objective-stats.component.html',
  styleUrl: './objective-stats.component.scss',
})
export class ObjectiveStatsComponent {
  private readonly store = inject(ObjectivesStore);

  readonly objective = inject(ObjectiveContext).objective;
  readonly width = WIDTH;
  readonly height = HEIGHT;
  readonly padding = PADDING;
  readonly formatDate = formatDate;
  readonly formatNumber = formatNumber;
  readonly activeIndex = signal<number | null>(null);

  readonly tint = computed(() => {
    const objective = this.objective();
    return objective ? objectiveTint(objective.category, this.store.settings().categoryColors) : '#3264ed';
  });
  readonly unit = computed(() => this.objective()?.metric?.unit ?? '');
  readonly tiles = computed(() => {
    const objective = this.objective();
    return objective?.metric ? this.buildTiles(objective) : [];
  });

  readonly chart = computed(() => {
    const objective = this.objective();
    const metric = objective?.metric;
    if (!objective || !metric) return null;
    const done = objective.sessions
      .filter((session) => session.status === 'done')
      .sort((first, second) => first.date.localeCompare(second.date));
    if (!done.length) return null;

    let running = 0;
    const values = done.map((session) => {
      running = metric.aggregation === 'max' ? Math.max(running, session.value) : running + session.value;
      return { date: session.date, value: running };
    });
    const step = niceStep(Math.max(metric.target, running));
    const yMax = Math.ceil(Math.max(metric.target, running) / step) * step;
    const plotWidth = WIDTH - PADDING.left - PADDING.right;
    const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
    const span = Math.max(1, daysBetween(values[0].date, values[values.length - 1].date));
    const xOf = (date: IsoDate): number =>
      values.length === 1
        ? PADDING.left + plotWidth / 2
        : PADDING.left + (daysBetween(values[0].date, date) / span) * plotWidth;
    const yOf = (value: number): number => PADDING.top + plotHeight - (value / yMax) * plotHeight;

    const points: ProgressPoint[] = values.map(({ date, value }) => ({ date, value, x: xOf(date), y: yOf(value) }));
    const line = points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
    const baseline = yOf(0);
    const first = points[0];
    const last = points[points.length - 1];
    const ticks = Array.from({ length: Math.round(yMax / step) + 1 }, (_, index) => ({
      y: yOf(index * step),
      label: formatNumber(index * step),
    }));
    const xLabels = points.length === 1
      ? [{ x: first.x, label: formatShortDate(first.date), anchor: 'middle' }]
      : [
          { x: first.x, label: formatShortDate(first.date), anchor: 'start' },
          { x: last.x, label: formatShortDate(last.date), anchor: 'end' },
        ];

    return {
      points,
      line,
      area: `${line} L${last.x.toFixed(1)},${baseline} L${first.x.toFixed(1)},${baseline} Z`,
      ticks,
      xLabels,
      baseline,
      targetY: yOf(metric.target),
      targetLabel: `Objectif : ${formatNumber(metric.target)} ${metric.unit}`,
      last,
      lastLabel: `${formatNumber(last.value)} ${metric.unit}`,
      summary: `Progression de ${formatNumber(first.value)} à ${formatNumber(last.value)} ${metric.unit} entre le ${formatDate(first.date)} et le ${formatDate(last.date)}, pour un objectif de ${formatNumber(metric.target)} ${metric.unit}.`,
    };
  });

  readonly tooltip = computed(() => {
    const chart = this.chart();
    const index = this.activeIndex();
    const point = index === null ? undefined : chart?.points[index];
    if (!point) return null;
    return {
      point,
      // Keep the tooltip inside the card near the chart edges.
      left: Math.min(80, Math.max(20, (point.x / WIDTH) * 100)),
      top: (point.y / HEIGHT) * 100,
      value: `${formatNumber(point.value)} ${this.unit()}`,
      date: formatDate(point.date),
    };
  });

  trackPointer(event: PointerEvent, svg: Element): void {
    const points = this.chart()?.points;
    if (!points?.length) return;
    const bounds = svg.getBoundingClientRect();
    if (!bounds.width) return;
    const x = ((event.clientX - bounds.left) / bounds.width) * WIDTH;
    let nearest = 0;
    points.forEach((point, index) => {
      if (Math.abs(point.x - x) < Math.abs(points[nearest].x - x)) nearest = index;
    });
    this.activeIndex.set(nearest);
  }

  navigate(event: KeyboardEvent): void {
    const count = this.chart()?.points.length ?? 0;
    if (!count) return;
    const current = this.activeIndex() ?? count - 1;
    const next: Record<string, number> = {
      ArrowLeft: Math.max(0, current - 1),
      ArrowRight: Math.min(count - 1, current + 1),
      Home: 0,
      End: count - 1,
    };
    if (!(event.key in next)) return;
    event.preventDefault();
    this.activeIndex.set(next[event.key]);
  }

  focusChart(): void {
    if (this.activeIndex() === null) this.activeIndex.set((this.chart()?.points.length ?? 1) - 1);
  }

  private buildTiles(objective: Objective): { value: string; label: string }[] {
    const unit = objective.metric?.unit ?? '';
    const done = objective.sessions.filter((session) => session.status === 'done');
    const missed = objective.sessions.filter((session) => session.status === 'missed').length;
    const minutes = done.reduce((total, session) => total + (session.durationMinutes ?? 0), 0);
    const average = done.length ? done.reduce((total, session) => total + session.value, 0) / done.length : 0;
    const attendance = done.length + missed ? Math.round((done.length / (done.length + missed)) * 100) : 0;
    return [
      {
        value: `${formatNumber(metricCurrent(objective))} ${unit}`,
        label: objective.metric?.aggregation === 'max' ? 'Meilleure séance' : 'Total cumulé',
      },
      minutes
        ? { value: formatDuration(minutes), label: 'Temps total' }
        : { value: `${done.length}`, label: 'Séances réalisées' },
      { value: `${formatNumber(average)} ${unit}`, label: 'Moyenne par séance' },
      { value: `${attendance} %`, label: 'Assiduité' },
    ];
  }
}
