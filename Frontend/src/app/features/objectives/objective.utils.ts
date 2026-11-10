import { formatLocale, t, tCount } from '../../core/i18n/translate';
import { addDays, daysBetween, formatDate, formatNarrowWeekday, formatWeekday, normalizeText, pad2, toIsoDate } from '../../core/time/dates';
import type {
  CompletionMode,
  DueReminder,
  IsoDate,
  Objective,
  ObjectiveCategory,
  ObjectiveRecurrence,
  ObjectiveReminder,
  ObjectiveStatus,
  ObjectiveSummary,
  ImportObjectiveRequest,
  ObjectiveActivityEntry,
  ObjectiveActivityKind,
} from '@plano/common';

export interface CategoryMeta {
  value: ObjectiveCategory;
  /** Translation key. */
  label: string;
  color: string;
}

export const OBJECTIVE_CATEGORIES: readonly CategoryMeta[] = [
  { value: 'health', label: 'objectives.categories.health', color: '#3264ed' },
  { value: 'learning', label: 'objectives.categories.learning', color: '#22a95a' },
  { value: 'finance', label: 'objectives.categories.finance', color: '#e65591' },
  { value: 'development', label: 'objectives.categories.development', color: '#f08c1a' },
  { value: 'other', label: 'objectives.categories.other', color: '#7c5cf0' },
];

/** Translation keys, here and in the maps below. */
export const STATUS_LABELS: Readonly<Record<ObjectiveStatus, string>> = {
  active: 'objectives.statuses.active',
  completed: 'objectives.statuses.completed',
  paused: 'objectives.statuses.paused',
};

export const COMPLETION_LABELS: Readonly<Record<Exclude<CompletionMode, 'none'>, { label: string; hint: string }>> = {
  children: { label: 'objectives.completion.children', hint: 'objectives.completion.childrenHint' },
  metric: { label: 'objectives.completion.metric', hint: 'objectives.completion.metricHint' },
  habit: { label: 'objectives.completion.habit', hint: 'objectives.completion.habitHint' },
  manual: { label: 'objectives.completion.manual', hint: 'objectives.completion.manualHint' },
  list: { label: 'objectives.completion.list', hint: 'objectives.completion.listHint' },
};

/** How often a count or a habit starts again, offered next to its target. */
export const RHYTHM_OPTIONS: readonly { value: ObjectiveRecurrence; label: string }[] = [
  { value: 'none', label: 'objectives.rhythm.none' },
  { value: 'weekly', label: 'objectives.rhythm.weekly' },
  { value: 'monthly', label: 'objectives.rhythm.monthly' },
  { value: 'yearly', label: 'objectives.rhythm.yearly' },
];

export const PERIOD_LABELS: Readonly<
  Record<Exclude<ObjectiveRecurrence, 'none'>, { per: string; every: string; current: string; reached: string }>
> = {
  weekly: {
    per: 'objectives.periods.weekly.per',
    every: 'objectives.periods.weekly.every',
    current: 'objectives.periods.weekly.current',
    reached: 'objectives.periods.weekly.reached',
  },
  monthly: {
    per: 'objectives.periods.monthly.per',
    every: 'objectives.periods.monthly.every',
    current: 'objectives.periods.monthly.current',
    reached: 'objectives.periods.monthly.reached',
  },
  yearly: {
    per: 'objectives.periods.yearly.per',
    every: 'objectives.periods.yearly.every',
    current: 'objectives.periods.yearly.current',
    reached: 'objectives.periods.yearly.reached',
  },
};

export const DUE_REMINDER_LABELS: Readonly<Record<DueReminder, string>> = {
  none: 'objectives.dueReminders.none',
  'same-day': 'objectives.dueReminders.sameDay',
  'day-before': 'objectives.dueReminders.dayBefore',
  'week-before': 'objectives.dueReminders.weekBefore',
};

/** A Monday: reminders number weekdays from 0 for Monday. */
const A_MONDAY = '2024-01-01';

/** "L" to "D", Monday first: the headers of a month calendar. */
export function weekdayInitials(): string[] {
  return Array.from({ length: 7 }, (_, index) => formatNarrowWeekday(addDays(A_MONDAY, index)));
}

/** "lundi" to "dimanche" in the interface language, Monday first. */
export function weekdayNames(): string[] {
  return Array.from({ length: 7 }, (_, index) => formatWeekday(addDays(A_MONDAY, index)));
}

export function categoryMeta(category: ObjectiveCategory): CategoryMeta {
  return OBJECTIVE_CATEGORIES.find((meta) => meta.value === category) ?? OBJECTIVE_CATEGORIES[4];
}

/** Category colour, or the brand blue when "Couleur par catégorie" is turned off. */
export function objectiveTint(category: ObjectiveCategory, categoryColors: boolean): string {
  return categoryColors ? categoryMeta(category).color : '#3264ed';
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(formatLocale(), { maximumFractionDigits: 1 }).format(value);
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return hours ? t('objectives.duration.hours', { hours, minutes: pad2(rest) }) : t('objectives.duration.minutes', { minutes: rest });
}

/** The unit of an amount: the metric's own, or days and items, named in the interface language. */
export function amountUnit(objective: Pick<ObjectiveSummary, 'completion' | 'amount'>): string {
  const target = objective.amount?.target ?? 0;
  if (objective.completion === 'habit') return tCount('objectives.units.days', target);
  if (objective.completion === 'list') return tCount('objectives.units.items', target);
  return objective.amount?.unit ?? '';
}

/** "3 / 10 km", or the percentage; empty for an objective without a completion bar. */
export function progressText(objective: ObjectiveSummary, showPercentage: boolean): string {
  if (objective.percent === null) return '';
  const { amount } = objective;
  return showPercentage || !amount
    ? t('objectives.percent', { percent: objective.percent })
    : `${formatNumber(amount.current)} / ${formatNumber(amount.target)} ${amountUnit(objective)}`;
}

/** What sharing adds to a card: whose it is, or that it is shared; empty when private. */
export function sharingLabel(objective: Pick<ObjectiveSummary, 'role' | 'owner' | 'sharing' | 'assignee'>): string {
  const parts: string[] = [];
  if (objective.role !== 'owner') parts.push(t('objectives.sharing.by', { name: objective.owner.name }));
  else if (objective.sharing === 'common') parts.push(t('objectives.sharing.common'));
  else if (objective.sharing === 'shared') parts.push(t('objectives.sharing.shared'));
  if (objective.assignee) parts.push(t('objectives.sharing.for', { name: objective.assignee.name }));
  return parts.join(' · ');
}

export function dueCaption(
  objective: Pick<ObjectiveSummary, 'dueDate' | 'status' | 'completedAt'> & Partial<Pick<ObjectiveSummary, 'completedBy'>>,
): string {
  if (objective.status === 'completed' && objective.completedAt) {
    const date = formatDate(toIsoDate(new Date(objective.completedAt)));
    return objective.completedBy
      ? t('objectives.due.completedBy', { date, name: objective.completedBy.name })
      : t('objectives.due.completed', { date });
  }
  return objective.dueDate ? t('objectives.due.on', { date: formatDate(objective.dueDate) }) : t('objectives.due.none');
}

export interface TimelapseView {
  /** How full the bar is, 0 to 100. */
  percent: number;
  label: string;
  /** Past the deadline and not complete: the bar is full and red. */
  overdue: boolean;
}

/** The timelapse bar of an objective; null when it has none. */
export function timelapseView(
  objective: Pick<ObjectiveSummary, 'timelapse' | 'startDate' | 'dueDate' | 'status'>,
  today: IsoDate,
): TimelapseView | null {
  const { timelapse, startDate, dueDate, status } = objective;
  if (timelapse === 'off' || !dueDate) return null;
  const left = daysBetween(today, dueDate);
  if (left < 0 && status !== 'completed') {
    return { percent: 100, label: tCount('objectives.timelapse.late', -left), overdue: true };
  }
  const total = Math.max(1, daysBetween(startDate, dueDate));
  const elapsed = Math.min(total, Math.max(0, daysBetween(startDate, today)));
  const fill = (elapsed / total) * 100;
  let label = tCount('objectives.timelapse.left', left);
  if (status === 'completed') label = t('objectives.timelapse.done');
  else if (left === 0) label = t('objectives.timelapse.lastDay');
  return {
    percent: Math.round(timelapse === 'elapsed' ? fill : 100 - fill),
    label,
    overdue: false,
  };
}

/** Kinds whose history line names what they are about (a person, a session, a template). */
const WITH_DETAIL: ReadonlySet<ObjectiveActivityKind> = new Set<ObjectiveActivityKind>([
  'created',
  'session',
  'session_removed',
  'member_added',
  'member_removed',
  'assigned',
]);

/** What a line of history says after the person's name, in the interface language. */
export function activityLabel({ kind, detail }: Pick<ObjectiveActivityEntry, 'kind' | 'detail'>): string {
  const key = `objectives.activity.${kind}`;
  if (!detail) return t(key);
  switch (kind) {
    case 'check_in':
    case 'check_out':
      return t(`${key}On`, { detail: formatDate(detail) });
    case 'progress':
      return t(`${key}To`, { detail });
    default:
      return WITH_DETAIL.has(kind) ? t(`${key}With`, { detail }) : `${t(key)} ${detail}`;
  }
}

export function objectiveReminderLabel(reminder: ObjectiveReminder): string {
  switch (reminder.frequency) {
    case 'none':
      return t('objectives.reminders.none');
    case 'daily':
      return t('objectives.reminders.daily', { time: reminder.time });
    case 'weekly':
      return t('objectives.reminders.weekly', { day: weekdayNames()[reminder.weekday] ?? weekdayNames()[0], time: reminder.time });
  }
}

export function longestStreak(dates: readonly IsoDate[]): number {
  const sorted = [...new Set(dates)].sort((first, second) => first.localeCompare(second));
  let best = 0;
  let current = 0;
  sorted.forEach((date, index) => {
    current = index > 0 && daysBetween(sorted[index - 1], date) === 1 ? current + 1 : 1;
    best = Math.max(best, current);
  });
  return best;
}

export function slugify(value: string): string {
  return normalizeText(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'objectif';
}

/** Well under the 100 KB a request to the API can hold, accents counting double. */
const IMPORT_BATCH_CHARACTERS = 60_000;

/**
 * Splits what a browser holds into requests the API accepts, keeping the order:
 * under the body limit, and at most `maxCount` items each. An item too large for
 * any request goes alone, and is refused alone.
 */
export function importBatches<T>(items: readonly T[], maxCount = Number.POSITIVE_INFINITY): T[][] {
  const batches: T[][] = [];
  let size = 0;
  for (const item of items) {
    const length = JSON.stringify(item).length;
    if (!batches.length || size + length > IMPORT_BATCH_CHARACTERS || batches[batches.length - 1].length >= maxCount) {
      batches.push([]);
      size = 0;
    }
    batches[batches.length - 1].push(item);
    size += length;
  }
  return batches;
}

const VALID_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(date: string | null | undefined): IsoDate | null {
  return date && VALID_DATE.test(date) ? date : null;
}

/**
 * An objective as this browser stored it, in the shape the API accepts. Old data
 * may hold values the API refuses (long texts, a missing target): they are made
 * valid here, or one bad objective would keep the others from ever being imported.
 */
export function toImportRequest(objective: Objective, today: IsoDate): ImportObjectiveRequest {
  const metric = objective.metric;
  const habit = objective.habit;
  const createdOn = validDate(objective.createdOn) ?? today;
  const reminder = objective.reminder;
  return {
    localId: objective.id.slice(0, 200) || slugify(objective.title),
    title: objective.title.trim().slice(0, 80) || t('objectives.untitled'),
    category: objective.category,
    tracking: objective.tracking,
    status: objective.status,
    archived: objective.archived,
    createdOn,
    dueDate: validDate(objective.dueDate),
    completedOn: validDate(objective.completedOn),
    description: objective.description.slice(0, 500),
    plan: objective.plan.slice(0, 120),
    reminder: {
      frequency: reminder?.frequency ?? 'none',
      time: reminder?.time || '09:00',
      weekday: reminder?.weekday ?? 0,
    },
    dueReminder: objective.dueReminder ?? 'none',
    metric:
      objective.tracking === 'metric'
        ? {
            unit: (metric?.unit ?? '').trim().slice(0, 12) || '-',
            target: metric && metric.target > 0 ? metric.target : 1,
            aggregation: metric?.aggregation ?? 'sum',
          }
        : null,
    sessions: (objective.sessions ?? [])
      .filter((session) => validDate(session.date))
      .map((session) => ({
        date: session.date,
        status: session.status,
        label: (session.label ?? '').slice(0, 60),
        value: Math.max(0, session.value || 0),
        durationMinutes: session.durationMinutes ?? null,
      })),
    steps: (objective.tracking === 'steps' ? (objective.steps ?? []) : [])
      .filter((step) => step.label.trim())
      .map((step) => ({
        label: step.label.trim().slice(0, 80),
        done: step.done,
        completedOn: validDate(step.completedOn),
      })),
    habit:
      objective.tracking === 'habit'
        ? {
            targetDays: Math.max(1, habit?.targetDays ?? 1),
            checkIns: (habit?.checkIns ?? []).filter((date) => validDate(date)),
          }
        : null,
  };
}
