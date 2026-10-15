export type ListIcon = 'cart' | 'home' | 'suitcase' | 'gift' | 'tools';
export type ListOwnership = 'mine' | 'shared';
export type ShareRole = 'owner' | 'editor' | 'viewer';

export interface PlanoList {
  slug: string;
  name: string;
  detail: string;
  completed: number;
  total: number;
  icon: ListIcon;
  color: string;
  surface: string;
  ownership: ListOwnership;
  archived?: boolean;
}

export interface ListSettings {
  defaultView: 'list' | 'grid';
  showCounts: boolean;
  showCompleted: boolean;
  completedLast: boolean;
  defaultReminder: string;
  notifyScope: 'mine' | 'all' | 'none';
  archiveCompleted: boolean;
  confirmDelete: boolean;
}

export interface ListEntry {
  id: string;
  name: string;
  done: boolean;
  highlighted?: boolean;
  addedBy: string;
  addedAt: string;
  assignedTo: string;
  reminder: string;
  notes: string;
}

export interface ListSection {
  id: string;
  name: string;
  color: string;
  entries: ListEntry[];
}

export interface ListMember {
  id: string;
  name: string;
  initials: string;
  color: string;
  role: ShareRole;
}

export interface ListDetail {
  description: string;
  sections: ListSection[];
  members: ListMember[];
  sharingEnabled: boolean;
  total: number;
}

export interface DashboardDay {
  label: string;
  date: number;
  selected?: boolean;
  hasEvent?: boolean;
}

export interface DashboardTask {
  id: string;
  label: string;
  done: boolean;
}

export interface DashboardData {
  weekDays: DashboardDay[];
  tasks: DashboardTask[];
}

export type ObjectiveCategory =
  | 'health'
  | 'learning'
  | 'finance'
  | 'development'
  | 'other';
export type ObjectiveStatus = 'active' | 'paused' | 'completed';
/** How progress is measured: a numeric target, a checklist of steps, or daily check-ins. */
export type ObjectiveTracking = 'metric' | 'steps' | 'habit';
export type ObjectiveSessionStatus = 'done' | 'planned' | 'missed' | 'rest';
export type DueReminder = 'none' | 'same-day' | 'day-before' | 'week-before';

/** Calendar dates are stored as local `YYYY-MM-DD` strings to stay timezone-neutral. */
export type IsoDate = string;

export interface ObjectiveSession {
  id: string;
  date: IsoDate;
  status: ObjectiveSessionStatus;
  label: string;
  value: number;
  durationMinutes?: number;
}

export interface ObjectiveStep {
  id: string;
  label: string;
  done: boolean;
  completedOn: IsoDate | null;
}

export interface ObjectiveMetric {
  unit: string;
  target: number;
  /** `max` keeps the best session (longest run), `sum` accumulates (money saved, books read). */
  aggregation: 'sum' | 'max';
  sessionsTarget: number;
}

export interface ObjectiveHabit {
  targetDays: number;
  checkIns: IsoDate[];
}

export interface ObjectiveReminder {
  frequency: 'none' | 'daily' | 'weekly';
  time: string;
  /** 0 = Monday … 6 = Sunday, used when `frequency` is `weekly`. */
  weekday: number;
}

export interface Objective {
  id: string;
  title: string;
  category: ObjectiveCategory;
  tracking: ObjectiveTracking;
  status: ObjectiveStatus;
  archived: boolean;
  ownerId: string;
  sharedWith: string[];
  shareCode: string;
  createdOn: IsoDate;
  dueDate: IsoDate | null;
  completedOn: IsoDate | null;
  description: string;
  plan: string;
  reminder: ObjectiveReminder;
  dueReminder: DueReminder;
  metric: ObjectiveMetric | null;
  sessions: ObjectiveSession[];
  steps: ObjectiveStep[];
  habit: ObjectiveHabit | null;
}

export interface ObjectiveContact {
  id: string;
  name: string;
  initials: string;
  color: string;
}

export interface ObjectiveSettings {
  defaultView: 'list' | 'grid';
  showArchived: boolean;
  defaultDueReminder: DueReminder;
  notifications: boolean;
  habitReminders: 'scheduled' | 'none';
  showPercentage: boolean;
  categoryColors: boolean;
}

export interface ObjectivesData {
  /** Id of the signed-in person in `contacts`; drives the "Mes objectifs" / "Partagés" tabs. */
  currentUserId: string;
  items: Objective[];
  contacts: ObjectiveContact[];
  settings: ObjectiveSettings;
  recentIds: string[];
}

export interface PlanoData {
  version: 1;
  lists: PlanoList[];
  listDetails: Record<string, ListDetail>;
  listSettings: ListSettings;
  dashboard: DashboardData;
  objectives: ObjectivesData;
}

/** Persistence port implemented by memory, browser storage, or a future API. */
export interface PlanoDataAdapter {
  load(): PlanoData | null;
  save(data: PlanoData): void;
}
