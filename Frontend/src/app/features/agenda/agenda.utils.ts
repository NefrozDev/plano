import type {
  AgendaCalendar,
  AgendaEvent,
  AgendaSettings,
  EventRecurrence,
  ImportAgendaEventRequest,
  IsoDate,
  LocalDateTime,
} from '@plano/common';
import { formatLocale, t, tCount } from '../../core/i18n/translate';
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

/** Translation key of each repetition. */
export const RECURRENCE_LABELS: Readonly<Record<EventRecurrence, string>> = {
  none: 'agenda.recurrence.none',
  daily: 'agenda.recurrence.daily',
  weekly: 'agenda.recurrence.weekly',
  monthly: 'agenda.recurrence.monthly',
  yearly: 'agenda.recurrence.yearly',
};

/** Minutes before the start; null for no reminder. */
export const REMINDER_OPTIONS: readonly (number | null)[] = [null, 0, 5, 15, 30, 60, 1440];

export const DURATION_OPTIONS: readonly number[] = [15, 30, 45, 60, 90, 120];

/** Offsets are the standard-time ones; events are stored as floating local times. `label` is a translation key. */
export const TIME_ZONES: readonly { value: string; offset: string; label: string }[] = [
  { value: 'Europe/Brussels', offset: '(UTC+01:00)', label: 'agenda.timeZones.brussels' },
  { value: 'Europe/Paris', offset: '(UTC+01:00)', label: 'agenda.timeZones.paris' },
  { value: 'Europe/London', offset: '(UTC+00:00)', label: 'agenda.timeZones.london' },
  { value: 'America/Montreal', offset: '(UTC−05:00)', label: 'agenda.timeZones.montreal' },
  { value: 'UTC', offset: '(UTC+00:00)', label: 'agenda.timeZones.utc' },
];

/** "1 h 30", "2 heures": a duration in the interface language. */
export function durationLabel(minutes: number): string {
  if (minutes < 60) return tCount('agenda.duration.minutes', minutes);
  if (minutes % 60 === 0) return tCount('agenda.duration.hours', minutes / 60);
  return t('agenda.duration.hoursMinutes', { hours: Math.floor(minutes / 60), minutes: pad2(minutes % 60) });
}

export const EVENT_COLORS: readonly string[] = ['#3264ed', '#22a95a', '#8b5cf6', '#f59e0b', '#ef4444', '#e65591', '#94a3b8'];

/** "15 minutes avant", "1 jour avant": how long before the start a reminder comes. */
export function eventReminderLabel(minutes: number | null): string {
  if (minutes === null) return t('agenda.reminder.none');
  if (minutes === 0) return t('agenda.reminder.atStart');
  if (minutes % 1440 === 0) return tCount('agenda.reminder.days', minutes / 1440);
  if (minutes % 60 === 0) return tCount('agenda.reminder.hours', minutes / 60);
  return tCount('agenda.reminder.minutes', minutes);
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
  if (item.allDay) return t('agenda.allDay');
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
  if (bytes < 1024) return t('agenda.fileSize.bytes', { size: bytes });
  if (bytes < 1024 * 1024) return t('agenda.fileSize.kilobytes', { size: Math.round(bytes / 1024) });
  const megabytes = new Intl.NumberFormat(formatLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return t('agenda.fileSize.megabytes', { size: megabytes.format(bytes / (1024 * 1024)) });
}

const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const MAX_ATTACHMENTS = 5;

/**
 * An event as this browser stored it, in the shape the API accepts. Old data may
 * hold values the API refuses (long texts, a broken link): they are made valid
 * here, or one bad event would keep the others from ever being imported. Guests
 * stay behind: they were never told about it.
 */
export function toImportRequest(event: AgendaEvent): ImportAgendaEventRequest {
  const start = LOCAL_DATE_TIME.test(event.start) ? event.start : '2000-01-01T09:00';
  const end = LOCAL_DATE_TIME.test(event.end) && event.end >= start ? event.end : start;
  const text = (value: string | undefined, max: number) => (value ?? '').trim().slice(0, max);
  const url = text(event.conferenceUrl, 300);
  return {
    localId: event.id.slice(0, 64),
    title: text(event.title, 120) || t('agenda.untitled'),
    calendarId: text(event.calendarId, 40) || 'personnel',
    allDay: !!event.allDay,
    start,
    end,
    location: text(event.location, 120),
    description: text(event.description, 500),
    recurrence: event.recurrence in RECURRENCE_LABELS ? event.recurrence : 'none',
    reminderMinutes:
      Number.isInteger(event.reminderMinutes) && event.reminderMinutes! >= 0 && event.reminderMinutes! <= 40_320
        ? event.reminderMinutes
        : null,
    color: event.color && HEX_COLOR.test(event.color) ? event.color : null,
    conferenceUrl: url && isSafeUrl(url) ? url : '',
    attachments: (event.attachments ?? []).slice(0, MAX_ATTACHMENTS).map((file) => ({
      id: text(file.id, 40) || 'file',
      name: text(file.name, 200) || 'fichier',
      size: Number.isInteger(file.size) && file.size >= 0 ? file.size : 0,
      type: text(file.type, 100),
    })),
    notes: text(event.notes, 1000),
    availability: event.availability === 'free' ? 'free' : 'busy',
    visibility: event.visibility === 'private' ? 'private' : 'default',
  };
}
