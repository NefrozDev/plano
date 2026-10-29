import { Injectable, computed, inject, signal } from '@angular/core';
import type {
  IsoDate,
  Objective,
  ObjectiveCategory,
  ObjectiveContact,
  ObjectiveMetric,
  ObjectiveReminder,
  ObjectiveSession,
  ObjectiveSettings,
  ObjectiveStatus,
  ObjectiveTracking,
  ObjectivesData,
} from '@plano/common';
import { PlanoDataStore } from '../../core/data/plano-data.store';
import { createPerson } from '../../core/people/people';
import {
  APP_CLOCK,
  compareDueDates,
  createId,
  normalizeText,
  toIsoDate,
} from '../../core/time/dates';
import {
  categoryMeta,
  objectiveProgress,
  slugify,
  withDerivedStatus,
} from './objective.utils';

export type ObjectiveTab = 'all' | 'mine' | 'shared' | 'archived';

export interface ObjectiveFilters {
  /** Empty arrays mean "no restriction". */
  statuses: readonly ObjectiveStatus[];
  categories: readonly ObjectiveCategory[];
  /** `manual` follows the order the user set by dragging. */
  sort: 'manual' | 'dueDate' | 'progress' | 'title';
  direction: 'asc' | 'desc';
}

export interface ObjectiveDraft {
  title: string;
  category: ObjectiveCategory;
  tracking: ObjectiveTracking;
  dueDate: IsoDate | null;
  description: string;
  plan: string;
  reminder: ObjectiveReminder;
  metric: Omit<ObjectiveMetric, 'sessionsTarget'> | null;
  steps: readonly string[];
  habitTargetDays: number;
}

export const DEFAULT_OBJECTIVE_FILTERS: ObjectiveFilters = {
  statuses: [],
  categories: [],
  sort: 'manual',
  direction: 'asc',
};

const MAX_RECENT = 5;

@Injectable({ providedIn: 'root' })
export class ObjectivesStore {
  private readonly appData = inject(PlanoDataStore);
  private readonly clock = inject(APP_CLOCK);
  private readonly data = computed(() => this.appData.data().objectives);

  readonly objectives = computed(() => this.data().items);
  readonly contacts = computed(() => this.data().contacts);
  readonly settings = computed(() => this.data().settings);
  readonly currentUserId = computed(() => this.data().currentUserId);
  readonly recent = computed(() =>
    this.data()
      .recentIds.map((id) => this.find(id))
      .filter((objective): objective is Objective => !!objective),
  );
  /** Session-only filters, shared by the overview and the filter screen. */
  readonly filters = signal<ObjectiveFilters>(DEFAULT_OBJECTIVE_FILTERS);
  readonly activeFilterCount = computed(
    () => this.filters().statuses.length + this.filters().categories.length,
  );

  today(): IsoDate {
    return toIsoDate(this.clock());
  }

  find(id: string): Objective | undefined {
    return this.objectives().find((objective) => objective.id === id);
  }

  contact(id: string): ObjectiveContact | undefined {
    return this.contacts().find((contact) => contact.id === id);
  }

  /** Objectives for an overview tab, after filters and sorting. */
  query(tab: ObjectiveTab): Objective[] {
    const me = this.currentUserId();
    const { statuses, categories, sort, direction } = this.filters();
    const showArchived = this.settings().showArchived;
    const inTab = (objective: Objective): boolean => {
      if (tab === 'archived') return objective.archived;
      if (objective.archived && !(tab === 'all' && showArchived)) return false;
      if (tab === 'mine') return objective.ownerId === me;
      if (tab === 'shared') return objective.ownerId !== me || objective.sharedWith.length > 0;
      return true;
    };
    const factor = direction === 'asc' ? 1 : -1;
    const compare = (first: Objective, second: Objective): number => {
      if (sort === 'manual') return 0;
      if (sort === 'progress') return objectiveProgress(first) - objectiveProgress(second);
      if (sort === 'title') return first.title.localeCompare(second.title, 'fr');
      // Objectives without a due date always sort last.
      return compareDueDates(first.dueDate, second.dueDate);
    };
    const sorted = this.objectives()
      .filter(inTab)
      .filter((objective) => !statuses.length || statuses.includes(objective.status))
      .filter((objective) => !categories.length || categories.includes(objective.category))
      .sort((first, second) => compare(first, second) * factor);
    // The manual order is the stored order (sort() is stable): reverse it for "desc".
    return sort === 'manual' && factor < 0 ? sorted.reverse() : sorted;
  }

  /** Moves an objective onto another one's place in the user's own order. */
  moveObjective(id: string, targetId: string): void {
    const items = [...this.objectives()];
    const from = items.findIndex((objective) => objective.id === id);
    const to = items.findIndex((objective) => objective.id === targetId);
    // Checked before updating: every update is written to storage.
    if (from < 0 || to < 0 || from === to) return;
    const [moved] = items.splice(from, 1);
    items.splice(to, 0, moved);
    this.appData.update((data) => ({ ...data, objectives: { ...data.objectives, items } }));
  }

  search(query: string): Objective[] {
    const needle = normalizeText(query);
    if (!needle) return [];
    return this.objectives().filter((objective) =>
      [objective.title, objective.description, categoryMeta(objective.category).label]
        .some((text) => normalizeText(text).includes(needle)),
    );
  }

  create(draft: ObjectiveDraft): Objective {
    const base = slugify(draft.title);
    const id = this.find(base) ? `${base}-${createId('x').slice(2)}` : base;
    const objective: Objective = {
      id,
      title: draft.title.trim(),
      category: draft.category,
      tracking: draft.tracking,
      status: 'active',
      archived: false,
      ownerId: this.currentUserId(),
      sharedWith: [],
      shareCode: `${id}-${createId('s').slice(2, 8)}`,
      createdOn: this.today(),
      dueDate: draft.dueDate,
      completedOn: null,
      description: draft.description.trim(),
      plan: draft.plan.trim(),
      reminder: draft.reminder,
      dueReminder: this.settings().defaultDueReminder,
      metric: draft.tracking === 'metric' && draft.metric
        ? { ...draft.metric, sessionsTarget: 0 }
        : null,
      sessions: [],
      steps: draft.tracking === 'steps'
        ? draft.steps
            .map((label) => label.trim())
            .filter(Boolean)
            .map((label) => ({ id: createId('step'), label, done: false, completedOn: null }))
        : [],
      habit: draft.tracking === 'habit'
        ? { targetDays: Math.max(1, draft.habitTargetDays), checkIns: [] }
        : null,
    };
    this.updateData((data) => ({ ...data, items: [objective, ...data.items] }));
    return objective;
  }

  update(id: string, changes: Partial<Omit<Objective, 'id'>>): void {
    this.updateObjective(id, (objective) => ({ ...objective, ...changes }));
  }

  remove(id: string): void {
    this.updateData((data) => ({
      ...data,
      items: data.items.filter((objective) => objective.id !== id),
      recentIds: data.recentIds.filter((recentId) => recentId !== id),
    }));
  }

  setPaused(id: string, paused: boolean): void {
    // Resuming goes through `withDerivedStatus`, which completes it if already at 100 %.
    this.update(id, { status: paused ? 'paused' : 'active' });
  }

  toggleStep(id: string, stepId: string): void {
    const today = this.today();
    this.updateObjective(id, (objective) => ({
      ...objective,
      steps: objective.steps.map((step) =>
        step.id === stepId
          ? { ...step, done: !step.done, completedOn: step.done ? null : today }
          : step,
      ),
    }));
  }

  addStep(id: string, label: string): void {
    const trimmed = label.trim();
    if (!trimmed) return;
    this.updateObjective(id, (objective) => ({
      ...objective,
      steps: [...objective.steps, { id: createId('step'), label: trimmed, done: false, completedOn: null }],
    }));
  }

  removeStep(id: string, stepId: string): void {
    this.updateObjective(id, (objective) => ({
      ...objective,
      steps: objective.steps.filter((step) => step.id !== stepId),
    }));
  }

  toggleCheckIn(id: string, date: IsoDate): void {
    if (date > this.today()) return;
    this.updateObjective(id, (objective) => {
      if (!objective.habit) return objective;
      const checkIns = objective.habit.checkIns.includes(date)
        ? objective.habit.checkIns.filter((checkIn) => checkIn !== date)
        : [...objective.habit.checkIns, date].sort((first, second) => first.localeCompare(second));
      return { ...objective, habit: { ...objective.habit, checkIns } };
    });
  }

  addSession(id: string, session: Omit<ObjectiveSession, 'id'>): void {
    this.updateObjective(id, (objective) => ({
      ...objective,
      sessions: [...objective.sessions, { ...session, id: createId('session') }]
        .sort((first, second) => first.date.localeCompare(second.date)),
    }));
  }

  removeSession(id: string, sessionId: string): void {
    this.updateObjective(id, (objective) => ({
      ...objective,
      sessions: objective.sessions.filter((session) => session.id !== sessionId),
    }));
  }

  share(id: string, contactIds: readonly string[]): void {
    this.update(id, { sharedWith: [...contactIds] });
  }

  addContact(name: string): ObjectiveContact | null {
    const contact: ObjectiveContact | null = createPerson(name);
    if (!contact) return null;
    this.updateData((data) => ({ ...data, contacts: [...data.contacts, contact] }));
    return contact;
  }

  markViewed(id: string): void {
    if (this.data().recentIds[0] === id) return;
    this.updateData((data) => ({
      ...data,
      recentIds: [id, ...data.recentIds.filter((recentId) => recentId !== id)].slice(0, MAX_RECENT),
    }));
  }

  updateSettings(changes: Partial<ObjectiveSettings>): void {
    this.updateData((data) => ({ ...data, settings: { ...data.settings, ...changes } }));
  }

  resetFilters(): void {
    this.filters.set(DEFAULT_OBJECTIVE_FILTERS);
  }

  private updateObjective(id: string, change: (objective: Objective) => Objective): void {
    const today = this.today();
    this.updateData((data) => ({
      ...data,
      items: data.items.map((objective) =>
        objective.id === id ? withDerivedStatus(change(objective), today) : objective,
      ),
    }));
  }

  private updateData(change: (data: ObjectivesData) => ObjectivesData): void {
    this.appData.update((data) => ({ ...data, objectives: change(data.objectives) }));
  }
}
