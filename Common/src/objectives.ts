/**
 * REST contract of the objectives API (`/api/v1/objectives`). Request interfaces
 * are implemented by the API's validated DTOs. Objectives form a tree: every
 * sub-objective is a full objective, with its own bars and settings.
 */
import type {
  DueReminder,
  IsoDate,
  ObjectiveCategory,
  ObjectiveReminder,
  ObjectiveSessionStatus,
  ObjectiveStatus,
} from './models';

/**
 * What drives the completion bar. `none`: no bar, completed by hand;
 * `children`: weighted average of the sub-objectives; `metric`: a numeric target;
 * `habit`: days checked; `manual`: a percentage set by hand.
 */
export type CompletionMode = 'none' | 'children' | 'metric' | 'habit' | 'manual';
/** `elapsed` fills up from start to deadline; `remaining` starts full and empties. */
export type TimelapseMode = 'off' | 'elapsed' | 'remaining';
/** `max` keeps the best session (longest run), `sum` accumulates (money saved). */
export type MetricAggregation = 'sum' | 'max';
export type ObjectiveRole = 'owner' | 'contributor' | 'viewer';
/** A top-level objective can restart each period, the whole tree with it. */
export type ObjectiveRecurrence = 'none' | 'weekly' | 'monthly' | 'yearly';
/** `viewer` follows an objective (shared); `contributor` also moves it forward (common). */
export type ObjectiveMemberRole = Exclude<ObjectiveRole, 'owner'>;
/** What the people on an objective can do with it, as far as the user can see. */
export type ObjectiveSharing = 'private' | 'shared' | 'common';
/** What the others hear about, in a toast and a badge. */
export type ObjectiveNewsKind = 'invited' | 'contribution' | 'completed' | 'comment';
export type ObjectiveActivityKind =
  | 'created'
  | 'edited'
  | 'paused'
  | 'resumed'
  | 'archived'
  | 'unarchived'
  | 'session'
  | 'session_removed'
  | 'check_in'
  | 'check_out'
  | 'progress'
  | 'completed'
  | 'reopened'
  | 'member_added'
  | 'member_removed'
  | 'member_left'
  | 'assigned'
  | 'unassigned'
  | 'restarted';

export interface ObjectiveMetricSettings {
  unit: string;
  target: number;
  aggregation: MetricAggregation;
}

export interface ObjectivePerson {
  id: string;
  name: string;
}

/** Progress in the objective's own unit; only for metrics and habits. */
export interface ObjectiveAmount {
  current: number;
  target: number;
  unit: string;
}

/** An objective on a card or as a row of its parent. */
export interface ObjectiveSummary {
  id: string;
  parentId: string | null;
  title: string;
  category: ObjectiveCategory;
  status: ObjectiveStatus;
  archived: boolean;
  completion: CompletionMode;
  /** 0 to 100, reached only when complete; null without a completion bar. */
  percent: number | null;
  amount: ObjectiveAmount | null;
  timelapse: TimelapseMode;
  startDate: IsoDate;
  dueDate: IsoDate | null;
  /** ISO timestamp. */
  completedAt: string | null;
  /** Share of the parent's bar, relative to its siblings. */
  weight: number;
  /** The signed-in user's role. */
  role: ObjectiveRole;
  owner: ObjectivePerson;
  sharing: ObjectiveSharing;
  /** Who the user can see on this objective, owner first. */
  people: ObjectivePerson[];
  assignee: ObjectivePerson | null;
  completedBy: ObjectivePerson | null;
  recurrence: ObjectiveRecurrence;
  /** Direct sub-objectives, archived ones left out. */
  childCount: number;
  completedChildCount: number;
  /** Shown on the signed-in user's home page (their own choice). */
  onHome: boolean;
}

export interface ObjectiveSessionEntry {
  id: string;
  date: IsoDate;
  status: ObjectiveSessionStatus;
  label: string;
  value: number;
  durationMinutes: number | null;
  /** Null for an account since deleted. */
  author: ObjectivePerson | null;
}

export interface ObjectiveCheckIn {
  date: IsoDate;
  userId: string;
}

/** `id` is null for an objective above what the user was invited to: only its name shows. */
export interface ObjectiveCrumb {
  id: string | null;
  title: string;
}

export interface ObjectivePeriodEntry {
  startDate: IsoDate;
  endDate: IsoDate;
  /** Where the bar was; null without a completion bar. */
  percent: number | null;
  completed: boolean;
}

export interface ObjectiveMemberView extends ObjectivePerson {
  role: ObjectiveRole;
  /** Where this access comes from, when invited higher up. */
  inheritedFrom: ObjectiveCrumb | null;
}

/** One person's share of an objective: their amount, days or sub-objectives completed. */
export interface ObjectiveContribution {
  person: ObjectivePerson;
  value: number;
}

export interface ObjectiveDetail extends ObjectiveSummary {
  description: string;
  plan: string;
  metric: ObjectiveMetricSettings | null;
  habitTargetDays: number | null;
  manualProgress: number;
  /** The way down from the top of what the user can see, without this objective. */
  breadcrumb: ObjectiveCrumb[];
  children: ObjectiveSummary[];
  /** Everything below this objective, at any depth. */
  descendantCount: number;
  sessions: ObjectiveSessionEntry[];
  checkIns: ObjectiveCheckIn[];
  members: ObjectiveMemberView[];
  contributions: ObjectiveContribution[];
  /** How the past periods of a recurring objective ended, latest first. */
  periods: ObjectivePeriodEntry[];
  /** The signed-in user's own reminders. */
  reminder: ObjectiveReminder;
  dueReminder: DueReminder;
}

/** One line of history, on the objective or something below it. */
export interface ObjectiveActivityEntry {
  id: string;
  kind: ObjectiveActivityKind;
  /** What it was about: an amount, a day, a name. */
  detail: string;
  /** Null for an account since deleted. */
  actor: ObjectivePerson | null;
  objectiveId: string;
  objectiveTitle: string;
  /** ISO timestamp. */
  createdAt: string;
}

export interface ObjectiveCommentEntry {
  id: string;
  body: string;
  /** Null for an account since deleted. */
  author: ObjectivePerson | null;
  /** ISO timestamp. */
  createdAt: string;
}

export interface AddObjectiveCommentRequest {
  body: string;
}

/** Something dated on an objective the user can see, for the agenda. */
export interface ObjectiveAgendaItem {
  /** Planned session, or the day an open objective is due. */
  kind: 'session' | 'deadline';
  /** Stays the same across reloads. */
  key: string;
  objectiveId: string;
  objectiveTitle: string;
  category: ObjectiveCategory;
  date: IsoDate;
  label: string;
}

export interface ObjectiveSettingsFields {
  title?: string;
  category?: ObjectiveCategory;
  description?: string;
  plan?: string;
  completion?: CompletionMode;
  metric?: ObjectiveMetricSettings | null;
  habitTargetDays?: number | null;
  timelapse?: TimelapseMode;
  startDate?: IsoDate;
  dueDate?: IsoDate | null;
  weight?: number;
  /** Only on a top-level objective. */
  recurrence?: ObjectiveRecurrence;
}

export interface CreateObjectiveRequest extends ObjectiveSettingsFields {
  title: string;
  category: ObjectiveCategory;
  completion: CompletionMode;
  startDate: IsoDate;
  /** Under this objective; a new top-level objective without it. */
  parentId?: string;
  /** Sub-objectives to create with it, without a bar of their own. */
  children?: string[];
  reminder?: ObjectiveReminder;
  dueReminder?: DueReminder;
  members?: AddObjectiveMemberRequest[];
}

export interface UpdateObjectiveRequest extends ObjectiveSettingsFields {
  archived?: boolean;
  paused?: boolean;
  /** Someone who can open the objective; null to unassign. */
  assignedToUserId?: string | null;
}

/** Shares an objective, and everything below it, with one of the owner's contacts. */
export interface AddObjectiveMemberRequest {
  userId: string;
  role: ObjectiveMemberRole;
}

export interface UpdateObjectiveMemberRequest {
  role: ObjectiveMemberRole;
}

export interface AddObjectiveSessionRequest {
  date: IsoDate;
  status: ObjectiveSessionStatus;
  label: string;
  value: number;
  durationMinutes?: number;
}

export interface SetObjectiveProgressRequest {
  percent: number;
}

export interface SetObjectiveCompletedRequest {
  completed: boolean;
}

/** The signed-in user's full order of their top-level objectives. */
export interface ReorderObjectivesRequest {
  objectiveIds: string[];
}

/** The owner's order of an objective's sub-objectives, each named once. */
export interface ReorderChildObjectivesRequest {
  objectiveIds: string[];
}

export interface UpdateObjectivePreferencesRequest {
  onHome?: boolean;
  reminder?: ObjectiveReminder;
  dueReminder?: DueReminder;
}

/** An objective as this browser stored it before they moved to the API. */
export interface ImportObjectiveRequest {
  /** Its id in the browser: importing it twice creates it once. */
  localId: string;
  title: string;
  category: ObjectiveCategory;
  tracking: 'metric' | 'steps' | 'habit';
  status: ObjectiveStatus;
  archived: boolean;
  createdOn: IsoDate;
  dueDate: IsoDate | null;
  completedOn: IsoDate | null;
  description: string;
  plan: string;
  reminder: ObjectiveReminder;
  dueReminder: DueReminder;
  metric: ObjectiveMetricSettings | null;
  sessions: {
    date: IsoDate;
    status: ObjectiveSessionStatus;
    label: string;
    value: number;
    durationMinutes: number | null;
  }[];
  steps: { label: string; done: boolean; completedOn: IsoDate | null }[];
  habit: { targetDays: number; checkIns: IsoDate[] } | null;
}

export interface ImportObjectivesRequest {
  objectives: ImportObjectiveRequest[];
}

export interface ImportObjectivesResponse {
  /** Objectives created; those imported before are not counted. */
  imported: number;
}

/** The settings of an objective and everything below it, without progress or people. */
export interface ObjectiveTemplateNode {
  title: string;
  category: ObjectiveCategory;
  description: string;
  plan: string;
  completion: CompletionMode;
  metric: ObjectiveMetricSettings | null;
  habitTargetDays: number | null;
  timelapse: TimelapseMode;
  /** Days from start to deadline; null without a deadline. */
  durationDays: number | null;
  weight: number;
  recurrence: ObjectiveRecurrence;
  children: ObjectiveTemplateNode[];
}

export interface ObjectiveTemplateSummary {
  id: string;
  name: string;
  /** The objective and its sub-objectives. */
  nodeCount: number;
}

export interface SaveObjectiveTemplateRequest {
  name: string;
}

export interface UseObjectiveTemplateRequest {
  startDate: IsoDate;
}
