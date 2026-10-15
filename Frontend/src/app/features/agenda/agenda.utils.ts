import type {
  AgendaCalendar,
  AgendaEvent,
  AgendaSettings,
  EventRecurrence,
  IsoDate,
  LocalDateTime,
} from '@plano/common';
import { addDays, daysBetween, pad2, parseIsoDate, toIsoDate, toTimeOfDay } from '../../core/time/dates';

/** Anything the agenda can display: an event occurrence or a dated task from another feature. */
export interface AgendaItem {
  /** Unique per occurrence: `eventId@date` or a task key. */
  key: string;
  kind: 'event' | 'task';
  eventId: string | null;
  title: string;
  subtitle: string;
  color: string;
  allDay: boolean;
  start: LocalDateTime;
  end: LocalDateTime;
  participantIds: string[];
  done: boolean;
  /** Router link to open the item (event detail, list, objective). */
  link: string[];
  queryParams: Record<string, string>;
}

export interface Occurrence {
  start: LocalDateTime;
  end: LocalDateTime;
}

export const RECURRENCE_LABELS: Readonly<Record<EventRecurrence, string>> = {
  none: 'Jamais',
  daily: 'Tous les jours',
  weekly: 'Toutes les semaines',
  monthly: 'Tous les mois',
  yearly: 'Tous les ans',
};

export const REMINDER_OPTIONS: readonly { value: number | null; label: string }[] = [
  { value: null, label: 'Aucun' },
  { value: 0, label: 'À l’heure de l’événement' },
  { value: 5, label: '5 minutes avant' },
  { value: 15, label: '15 minutes avant' },
  { value: 30, label: '30 minutes avant' },
  { value: 60, label: '1 heure avant' },
  { value: 1440, label: '1 jour avant' },
];

export const DURATION_OPTIONS: readonly { value: number; label: string }[] = [
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 45, label: '45 minutes' },
  { value: 60, label: '1 heure' },
  { value: 90, label: '1 h 30' },
  { value: 120, label: '2 heures' },
];

/** Offsets are the standard-time ones; events are stored as floating local times. */
export const TIME_ZONES: readonly { value: string; label: string }[] = [
  { value: 'Europe/Brussels', label: '(UTC+01:00) Bruxelles' },
  { value: 'Europe/Paris', label: '(UTC+01:00) Paris' },
  { value: 'Europe/London', label: '(UTC+00:00) Londres' },
  { value: 'America/Montreal', label: '(UTC−05:00) Montréal' },
  { value: 'UTC', label: '(UTC+00:00) Temps universel' },
];

export const EVENT_COLORS: readonly string[] = ['#3264ed', '#22a95a', '#8b5cf6', '#f59e0b', '#ef4444', '#e65591', '#94a3b8'];

export function eventReminderLabel(minutes: number | null): string {
  return REMINDER_OPTIONS.find((option) => option.value === minutes)?.label ?? `${minutes} minutes avant`;
}

export function datePart(value: LocalDateTime): IsoDate {
  return value.slice(0, 10);
}

export function timePart(value: LocalDateTime): string {
  return value.slice(11, 16);
}

export function toLocalDateTime(date: IsoDate, time: string): LocalDateTime {
  return `${date}T${time}`;
}

export function minutesOfDay(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function toDate(value: LocalDateTime): Date {
  const date = parseIsoDate(datePart(value));
  date.setHours(Number(value.slice(11, 13)), Number(value.slice(14, 16)));
  return date;
}

function fromDate(date: Date): LocalDateTime {
  return toLocalDateTime(toIsoDate(date), toTimeOfDay(date));
}

export function addMinutes(value: LocalDateTime, minutes: number): LocalDateTime {
  const date = toDate(value);
  date.setMinutes(date.getMinutes() + minutes);
  return fromDate(date);
}

/** Minutes from `from` to `to` (calendar arithmetic, immune to DST hour shifts). */
export function minutesBetween(from: LocalDateTime, to: LocalDateTime): number {
  return daysBetween(datePart(from), datePart(to)) * 1440 + minutesOfDay(timePart(to)) - minutesOfDay(timePart(from));
}

export function formatTime(time: string, format: AgendaSettings['hourFormat']): string {
  if (format === '24h') return time;
  const [hours, minutes] = time.split(':').map(Number);
  return `${hours % 12 || 12}:${pad2(minutes)} ${hours < 12 ? 'AM' : 'PM'}`;
}

export function timeRangeLabel(item: Pick<AgendaItem, 'allDay' | 'start' | 'end'>, format: AgendaSettings['hourFormat']): string {
  if (item.allDay) return 'Toute la journée';
  const start = formatTime(timePart(item.start), format);
  return item.start === item.end ? start : `${start} – ${formatTime(timePart(item.end), format)}`;
}

/** Every date an occurrence touches (multi-day events appear on each of them). */
export function coveredDates(occurrence: Occurrence): IsoDate[] {
  const first = datePart(occurrence.start);
  const days = Math.max(0, daysBetween(first, datePart(occurrence.end)));
  return Array.from({ length: days + 1 }, (_, index) => addDays(first, index));
}

/**
 * Start of the `index`-th repetition, or null when it does not exist
 * (e.g. a monthly event on the 31st has no occurrence in April).
 */
function nthStart(event: AgendaEvent, index: number): LocalDateTime | null {
  const start = toDate(event.start);
  const day = start.getDate();
  const next = new Date(start);
  switch (event.recurrence) {
    case 'none':
      return index === 0 ? event.start : null;
    case 'daily':
      next.setDate(day + index);
      break;
    case 'weekly':
      next.setDate(day + index * 7);
      break;
    case 'monthly':
      next.setDate(1);
      next.setMonth(start.getMonth() + index);
      next.setDate(day);
      if (next.getDate() !== day) return null;
      break;
    case 'yearly':
      next.setDate(1);
      next.setFullYear(start.getFullYear() + index);
      next.setDate(day);
      if (next.getDate() !== day || next.getMonth() !== start.getMonth()) return null;
      break;
  }
  return fromDate(next);
}

const MAX_OCCURRENCES = 1000;

/** Occurrences of `event` that touch at least one day of [from, to] (inclusive). */
export function occurrencesBetween(event: AgendaEvent, from: IsoDate, to: IsoDate): Occurrence[] {
  const duration = minutesBetween(event.start, event.end);
  const spanDays = daysBetween(datePart(event.start), datePart(event.end));
  const gap = daysBetween(datePart(event.start), from) - spanDays;
  // Jump close to `from` instead of iterating from the very first occurrence.
  const firstIndex = {
    none: 0,
    daily: Math.max(0, gap),
    weekly: Math.max(0, Math.floor(gap / 7)),
    monthly: Math.max(0, Math.floor(gap / 31)),
    yearly: Math.max(0, Math.floor(gap / 366)),
  }[event.recurrence];

  const result: Occurrence[] = [];
  for (let index = firstIndex; index < firstIndex + MAX_OCCURRENCES; index++) {
    const start = nthStart(event, index);
    if (event.recurrence === 'none' && index > 0) break;
    if (!start) continue;
    if (datePart(start) > to) break;
    const end = addMinutes(start, duration);
    if (datePart(end) >= from) result.push({ start, end });
  }
  return result;
}

/** First occurrence ending on or after `date`, if any. */
export function nextOccurrence(event: AgendaEvent, date: IsoDate): Occurrence | null {
  return occurrencesBetween(event, date, addDays(date, 400))[0] ?? null;
}

export function eventColor(event: AgendaEvent, calendars: readonly AgendaCalendar[]): string {
  return event.color ?? calendars.find((calendar) => calendar.id === event.calendarId)?.color ?? '#94a3b8';
}

export interface PositionedItem {
  item: AgendaItem;
  /** Minutes from midnight, clamped to the day. */
  top: number;
  height: number;
  column: number;
  columns: number;
}

/**
 * Side-by-side layout for timed items of one day: overlapping items share the
 * width of their cluster, each in the first free column.
 */
export function layoutDay(items: readonly AgendaItem[], date: IsoDate): PositionedItem[] {
  const timed = items
    .filter((item) => !item.allDay)
    .map((item) => {
      const top = datePart(item.start) < date ? 0 : minutesOfDay(timePart(item.start));
      const bottom = datePart(item.end) > date ? 1440 : minutesOfDay(timePart(item.end));
      return { item, top, height: Math.max(20, bottom - top), column: 0, columns: 1 };
    })
    .sort((first, second) => first.top - second.top || second.height - first.height);

  let cluster: PositionedItem[] = [];
  let clusterEnd = -1;
  const closeCluster = (): void => {
    const columns = Math.max(1, ...cluster.map((entry) => entry.column + 1));
    cluster.forEach((entry) => (entry.columns = columns));
    cluster = [];
  };
  for (const entry of timed) {
    if (entry.top >= clusterEnd) closeCluster();
    const taken = new Set(cluster.filter((other) => other.top + other.height > entry.top).map((other) => other.column));
    let column = 0;
    while (taken.has(column)) column++;
    entry.column = column;
    cluster.push(entry);
    clusterEnd = Math.max(clusterEnd, entry.top + entry.height);
  }
  closeCluster();
  return timed;
}

/** Conference links must be web URLs: blocks `javascript:` and other schemes. */
export function isSafeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}
