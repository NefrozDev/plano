import { InjectionToken } from '@angular/core';
import type {
  DueReminder,
  IsoDate,
  Objective,
  ObjectiveCategory,
  ObjectiveReminder,
  ObjectiveStatus,
} from '@plano/common';

export interface CategoryMeta {
  value: ObjectiveCategory;
  label: string;
  color: string;
}

export const OBJECTIVE_CATEGORIES: readonly CategoryMeta[] = [
  { value: 'health', label: 'Santé', color: '#3264ed' },
  { value: 'learning', label: 'Apprentissage', color: '#22a95a' },
  { value: 'finance', label: 'Finances', color: '#e65591' },
  { value: 'development', label: 'Développement', color: '#f08c1a' },
  { value: 'other', label: 'Autre', color: '#7c5cf0' },
];

export const STATUS_LABELS: Readonly<Record<ObjectiveStatus, string>> = {
  active: 'En cours',
  completed: 'Terminés',
  paused: 'En pause',
};

export const DUE_REMINDER_LABELS: Readonly<Record<DueReminder, string>> = {
  none: 'Aucun',
  'same-day': 'Le jour même',
  'day-before': '1 jour avant',
  'week-before': '1 semaine avant',
};

export const WEEKDAY_LABELS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'] as const;

/** Overridable "now" so date-dependent screens stay deterministic in tests. */
export const OBJECTIVES_CLOCK = new InjectionToken<() => Date>('OBJECTIVES_CLOCK', {
  providedIn: 'root',
  factory: () => () => new Date(),
});

export function categoryMeta(category: ObjectiveCategory): CategoryMeta {
  return OBJECTIVE_CATEGORIES.find((meta) => meta.value === category) ?? OBJECTIVE_CATEGORIES[4];
}

/** Category colour, or the brand blue when "Couleur par catégorie" is turned off. */
export function objectiveTint(category: ObjectiveCategory, categoryColors: boolean): string {
  return categoryColors ? categoryMeta(category).color : '#3264ed';
}

export function parseIsoDate(date: IsoDate): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function toIsoDate(date: Date): IsoDate {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const result = parseIsoDate(date);
  result.setDate(result.getDate() + days);
  return toIsoDate(result);
}

/** Whole calendar days from `from` to `to`; rounding absorbs DST hour shifts. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((parseIsoDate(to).getTime() - parseIsoDate(from).getTime()) / 86_400_000);
}

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const shortDateFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const dayFormatter =new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'long' });
const monthFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
const numberFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

export function formatDate(date: IsoDate): string {
  return dateFormatter.format(parseIsoDate(date));
}

export function formatShortDate(date: IsoDate): string {
  return shortDateFormatter.format(parseIsoDate(date));
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatDay(date: IsoDate): string {
  return capitalize(dayFormatter.format(parseIsoDate(date)).replace('.', ''));
}

export function formatMonth(year: number, month: number): string {
  return capitalize(monthFormatter.format(new Date(year, month, 1)));
}

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return hours ? `${hours} h ${`${rest}`.padStart(2, '0')}` : `${rest} min`;
}

export function metricCurrent(objective: Objective): number {
  const values = objective.sessions
    .filter((session) => session.status === 'done')
    .map((session) => session.value);
  if (!values.length) return 0;
  return objective.metric?.aggregation === 'max'
    ? Math.max(...values)
    : values.reduce((total, value) => total + value, 0);
}

/** Achieved and target amounts in the objective's own unit (km, steps, days…). */
export function progressAmounts(objective: Objective): { current: number; target: number } {
  switch (objective.tracking) {
    case 'metric':
      return { current: metricCurrent(objective), target: objective.metric?.target ?? 0 };
    case 'steps':
      return {
        current: objective.steps.filter((step) => step.done).length,
        target: objective.steps.length,
      };
    case 'habit':
      return {
        current: objective.habit?.checkIns.length ?? 0,
        target: objective.habit?.targetDays ?? 0,
      };
  }
}

export function objectiveProgress(objective: Objective): number {
  const { current, target } = progressAmounts(objective);
  return target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
}

export function progressUnit(objective: Objective): string {
  if (objective.tracking === 'metric') return objective.metric?.unit ?? '';
  return objective.tracking === 'steps' ? 'étapes' : 'jours';
}

export function progressLabel(objective: Objective): string {
  const { current, target } = progressAmounts(objective);
  return `${formatNumber(current)} / ${formatNumber(target)} ${progressUnit(objective)}`;
}

/**
 * Derives the completion status from progress so it never contradicts the data:
 * reaching 100 % completes an objective, undoing progress reopens it.
 * Paused objectives keep their status until resumed.
 */
export function withDerivedStatus(objective: Objective, today: IsoDate): Objective {
  if (objective.status === 'paused') return objective;
  const complete = objectiveProgress(objective) >= 100;
  if (complete && objective.status !== 'completed') {
    return { ...objective, status: 'completed', completedOn: today };
  }
  if (!complete && objective.status === 'completed') {
    return { ...objective, status: 'active', completedOn: null };
  }
  return objective;
}

export function reminderLabel(reminder: ObjectiveReminder): string {
  switch (reminder.frequency) {
    case 'none':
      return 'Aucun rappel';
    case 'daily':
      return `Chaque jour à ${reminder.time}`;
    case 'weekly':
      return `Chaque ${WEEKDAY_LABELS[reminder.weekday] ?? WEEKDAY_LABELS[0]} à ${reminder.time}`;
  }
}

export function longestStreak(dates: readonly IsoDate[]): number {
  const sorted = [...new Set(dates)].sort();
  let best = 0;
  let current = 0;
  sorted.forEach((date, index) => {
    current = index > 0 && daysBetween(sorted[index - 1], date) === 1 ? current + 1 : 1;
    best = Math.max(best, current);
  });
  return best;
}

export interface CalendarDay {
  date: IsoDate;
  day: number;
  inMonth: boolean;
}

/** Monday-first weeks covering the month, padded with neighbouring-month days. */
export function monthGrid(year: number, month: number): CalendarDay[][] {
  const first = new Date(year, month, 1);
  const leading = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cellCount = Math.ceil((leading + daysInMonth) / 7) * 7;
  const weeks: CalendarDay[][] = [];
  for (let cell = 0; cell < cellCount; cell++) {
    const date = new Date(year, month, cell - leading + 1);
    if (cell % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push({
      date: toIsoDate(date),
      day: date.getDate(),
      inMonth: date.getMonth() === month,
    });
  }
  return weeks;
}

/** Lowercase, accent-free text used for forgiving search and slugs. */
export function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

export function slugify(value: string): string {
  return normalizeText(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'objectif';
}

export function createId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Date.now().toString(36)}`;
}
