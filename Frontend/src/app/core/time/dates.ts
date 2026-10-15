import { InjectionToken } from '@angular/core';
import type { IsoDate } from '@plano/common';

/** Overridable "now" so date-dependent screens stay deterministic in tests. */
export const APP_CLOCK = new InjectionToken<() => Date>('APP_CLOCK', {
  providedIn: 'root',
  factory: () => () => new Date(),
});

/** 1 = Monday, 0 = Sunday (same numbering as `Date.getDay()`). */
export type WeekStart = 0 | 1;

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

/** First day of the week containing `date`. */
export function startOfWeek(date: IsoDate, weekStartsOn: WeekStart = 1): IsoDate {
  const offset = (parseIsoDate(date).getDay() - weekStartsOn + 7) % 7;
  return addDays(date, -offset);
}

/** ISO 8601 week number (weeks start on Monday, week 1 contains January 4th). */
export function isoWeekNumber(date: IsoDate): number {
  const thursday = parseIsoDate(addDays(date, 3 - ((parseIsoDate(date).getDay() + 6) % 7)));
  const firstThursday = new Date(thursday.getFullYear(), 0, 4);
  return 1 + Math.round(((thursday.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
}

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const shortDateFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const dayFormatter = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'long' });
const longDayFormatter = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const monthFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatDate(date: IsoDate): string {
  return dateFormatter.format(parseIsoDate(date));
}

export function formatShortDate(date: IsoDate): string {
  return shortDateFormatter.format(parseIsoDate(date));
}

export function formatDay(date: IsoDate): string {
  return capitalize(dayFormatter.format(parseIsoDate(date)).replace('.', ''));
}

/** "Jeudi 15 octobre". */
export function formatLongDay(date: IsoDate): string {
  return capitalize(longDayFormatter.format(parseIsoDate(date)));
}

export function formatMonth(year: number, month: number): string {
  return capitalize(monthFormatter.format(new Date(year, month, 1)));
}

export interface CalendarDay {
  date: IsoDate;
  day: number;
  inMonth: boolean;
}

/** Weeks covering the month, padded with neighbouring-month days. */
export function monthGrid(year: number, month: number, weekStartsOn: WeekStart = 1): CalendarDay[][] {
  const first = new Date(year, month, 1);
  const leading = (first.getDay() - weekStartsOn + 7) % 7;
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

export function createId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Date.now().toString(36)}`;
}
