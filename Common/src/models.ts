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

export type AgendaView = 'day' | 'week' | 'month';
export type EventRecurrence = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

/**
 * Local "floating" date-time `YYYY-MM-DDTHH:mm` (no timezone offset): an event at
 * 09:00 stays at 09:00 wherever the agenda is opened.
 */
export type LocalDateTime = string;

export interface AgendaCalendar {
  id: string;
  name: string;
  color: string;
}

export interface AgendaContact {
  id: string;
  name: string;
  initials: string;
  color: string;
  /** Shown in the "Fréquemment contactés" section of the participant picker. */
  frequent: boolean;
}

/** Metadata only: files are not uploaded until a backend exists. */
export interface AgendaAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
}

export interface AgendaEvent {
  id: string;
  title: string;
  calendarId: string;
  allDay: boolean;
  start: LocalDateTime;
  end: LocalDateTime;
  location: string;
  description: string;
  participantIds: string[];
  recurrence: EventRecurrence;
  /** Minutes before the start; null = no reminder. */
  reminderMinutes: number | null;
  /** Overrides the calendar colour when set. */
  color: string | null;
  conferenceUrl: string;
  attachments: AgendaAttachment[];
  notes: string;
  availability: 'busy' | 'free';
  visibility: 'default' | 'private';
}

export interface AgendaSettings {
  /** 1 = Monday, 0 = Sunday. */
  weekStartsOn: 0 | 1;
  defaultDurationMinutes: number;
  timeZone: string;
  defaultReminderMinutes: number | null;
  eventNotifications: boolean;
  invitationNotifications: boolean;
  showWeekNumbers: boolean;
  hourFormat: '24h' | '12h';
}

export interface AgendaFilters {
  hiddenCalendarIds: string[];
  showEvents: boolean;
  /** Dated items from other features: list entry reminders, planned objective sessions. */
  showTasks: boolean;
  showPastEvents: boolean;
}

export interface AgendaData {
  calendars: AgendaCalendar[];
  contacts: AgendaContact[];
  events: AgendaEvent[];
  settings: AgendaSettings;
  filters: AgendaFilters;
  recentIds: string[];
}

export interface PlanoData {
  version: 1;
  dashboard: DashboardData;
  objectives: ObjectivesData;
  agenda: AgendaData;
}

/** Persistence port implemented by memory, browser storage, or a future API. */
export interface PlanoDataAdapter {
  load(): PlanoData | null;
  save(data: PlanoData): void;
}
