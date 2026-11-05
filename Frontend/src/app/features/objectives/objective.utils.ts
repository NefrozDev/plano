import { daysBetween, formatDate, normalizeText, pad2, toIsoDate } from '../../core/time/dates';
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

export const COMPLETION_LABELS: Readonly<Record<Exclude<CompletionMode, 'none'>, { label: string; hint: string }>> = {
  children: { label: 'Sous-objectifs', hint: 'Moyenne de leur progression' },
  metric: { label: 'Objectif chiffré', hint: 'Comptez ou additionnez : sorties, km, euros…' },
  habit: { label: 'Habitude', hint: 'Cochez les jours réussis dans un calendrier' },
  manual: { label: 'Pourcentage manuel', hint: 'Vous déplacez la barre vous-même' },
  list: { label: 'Liste', hint: 'Les éléments cochés de ses listes' },
};

/** How often a count or a habit starts again, offered next to its target. */
export const RHYTHM_OPTIONS: readonly { value: ObjectiveRecurrence; label: string }[] = [
  { value: 'none', label: 'En tout' },
  { value: 'weekly', label: 'Par semaine' },
  { value: 'monthly', label: 'Par mois' },
  { value: 'yearly', label: 'Par an' },
];

export const PERIOD_LABELS: Readonly<
  Record<Exclude<ObjectiveRecurrence, 'none'>, { per: string; every: string; current: string; reached: string }>
> = {
  weekly: { per: 'par semaine', every: 'chaque semaine', current: 'Cette semaine', reached: 'Semaines réussies' },
  monthly: { per: 'par mois', every: 'chaque mois', current: 'Ce mois-ci', reached: 'Mois réussis' },
  yearly: { per: 'par an', every: 'chaque année', current: 'Cette année', reached: 'Années réussies' },
};

export const DUE_REMINDER_LABELS: Readonly<Record<DueReminder, string>> = {
  none: 'Aucun',
  'same-day': 'Le jour même',
  'day-before': '1 jour avant',
  'week-before': '1 semaine avant',
};

export const WEEKDAY_LABELS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'] as const;

export function categoryMeta(category: ObjectiveCategory): CategoryMeta {
  return OBJECTIVE_CATEGORIES.find((meta) => meta.value === category) ?? OBJECTIVE_CATEGORIES[4];
}

/** Category colour, or the brand blue when "Couleur par catégorie" is turned off. */
export function objectiveTint(category: ObjectiveCategory, categoryColors: boolean): string {
  return categoryColors ? categoryMeta(category).color : '#3264ed';
}

const numberFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return hours ? `${hours} h ${pad2(rest)}` : `${rest} min`;
}

/** "3 / 10 km", or the percentage; empty for an objective without a completion bar. */
export function progressText(objective: ObjectiveSummary, showPercentage: boolean): string {
  if (objective.percent === null) return '';
  const { amount } = objective;
  return showPercentage || !amount
    ? `${objective.percent} %`
    : `${formatNumber(amount.current)} / ${formatNumber(amount.target)} ${amount.unit}`;
}

/** What sharing adds to a card: whose it is, or that it is shared; empty when private. */
export function sharingLabel(objective: Pick<ObjectiveSummary, 'role' | 'owner' | 'sharing' | 'assignee'>): string {
  const parts: string[] = [];
  if (objective.role !== 'owner') parts.push(`Par ${objective.owner.name}`);
  else if (objective.sharing === 'common') parts.push('Commun');
  else if (objective.sharing === 'shared') parts.push('Partagé');
  if (objective.assignee) parts.push(`Pour ${objective.assignee.name}`);
  return parts.join(' · ');
}

export function dueCaption(
  objective: Pick<ObjectiveSummary, 'dueDate' | 'status' | 'completedAt'> & Partial<Pick<ObjectiveSummary, 'completedBy'>>,
): string {
  if (objective.status === 'completed' && objective.completedAt) {
    const by = objective.completedBy ? ` par ${objective.completedBy.name}` : '';
    return `Terminé le ${formatDate(toIsoDate(new Date(objective.completedAt)))}${by}`;
  }
  return objective.dueDate ? `Échéance : ${formatDate(objective.dueDate)}` : 'Sans échéance';
}

export interface TimelapseView {
  /** How full the bar is, 0 to 100. */
  percent: number;
  label: string;
  /** Past the deadline and not complete: the bar is full and red. */
  overdue: boolean;
}

function days(count: number): string {
  return `${count} ${count > 1 ? 'jours' : 'jour'}`;
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
    return { percent: 100, label: `${days(-left)} de retard`, overdue: true };
  }
  const total = Math.max(1, daysBetween(startDate, dueDate));
  const elapsed = Math.min(total, Math.max(0, daysBetween(startDate, today)));
  const fill = (elapsed / total) * 100;
  let label = `${days(left)} restant${left > 1 ? 's' : ''}`;
  if (status === 'completed') label = 'Terminé';
  else if (left === 0) label = 'Dernier jour';
  return {
    percent: Math.round(timelapse === 'elapsed' ? fill : 100 - fill),
    label,
    overdue: false,
  };
}

const ACTIVITY_LABELS: Readonly<Record<ObjectiveActivityKind, string>> = {
  created: 'a créé l’objectif',
  edited: 'a modifié les réglages',
  paused: 'a mis en pause',
  resumed: 'a repris',
  archived: 'a archivé',
  unarchived: 'a désarchivé',
  session: 'a ajouté une séance',
  session_removed: 'a retiré une séance',
  check_in: 'a réussi le',
  check_out: 'a décoché le',
  progress: 'a avancé à',
  completed: 'a terminé',
  reopened: 'a rouvert',
  member_added: 'a invité',
  member_removed: 'a retiré',
  member_left: 'a quitté l’objectif',
  assigned: 'a assigné à',
  unassigned: 'a retiré l’assignation',
  restarted: 'a relancé une nouvelle période',
};

/** What a line of history says after the person's name. */
export function activityLabel({ kind, detail }: Pick<ObjectiveActivityEntry, 'kind' | 'detail'>): string {
  const label = ACTIVITY_LABELS[kind];
  if (!detail) return label;
  switch (kind) {
    case 'check_in':
    case 'check_out':
      return `${label} ${formatDate(detail)}`;
    case 'progress':
      return `${label} ${detail} %`;
    case 'session':
    case 'session_removed':
      return `${label} : ${detail}`;
    default:
      return `${label} ${detail}`;
  }
}

export function objectiveReminderLabel(reminder: ObjectiveReminder): string {
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
    title: objective.title.trim().slice(0, 80) || 'Objectif',
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
