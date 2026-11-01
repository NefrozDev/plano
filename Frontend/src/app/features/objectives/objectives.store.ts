import { Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type {
  AddObjectiveMemberRequest,
  AddObjectiveSessionRequest,
  CreateObjectiveRequest,
  IsoDate,
  LiveEvent,
  ObjectiveAgendaItem,
  ObjectiveCategory,
  ObjectiveDetail,
  ObjectiveMemberRole,
  ObjectiveSettings,
  ObjectiveStatus,
  ObjectiveSummary,
  ObjectiveTemplateSummary,
  ObjectivesData,
  UpdateObjectivePreferencesRequest,
  UpdateObjectiveRequest,
} from '@plano/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { PlanoDataStore } from '../../core/data/plano-data.store';
import { httpErrorMessage } from '../../core/http/http-error-message';
import { LiveUpdatesService } from '../../core/live/live-updates.service';
import { APP_CLOCK, compareDueDates, normalizeText, toIsoDate } from '../../core/time/dates';
import { ObjectivesApiService } from './objectives-api.service';
import { categoryMeta, toImportRequest } from './objective.utils';

export type ObjectiveTab = 'all' | 'mine' | 'shared' | 'archived';

export interface ObjectiveFilters {
  /** Empty arrays mean "no restriction". */
  statuses: readonly ObjectiveStatus[];
  categories: readonly ObjectiveCategory[];
  /** `manual` follows the order the user set by dragging. */
  sort: 'manual' | 'dueDate' | 'progress' | 'title';
  direction: 'asc' | 'desc';
}

export const DEFAULT_OBJECTIVE_FILTERS: ObjectiveFilters = {
  statuses: [],
  categories: [],
  sort: 'manual',
  direction: 'asc',
};

const FAILURE_MESSAGE = 'L’action a échoué. Veuillez réessayer.';
const MAX_RECENT = 5;
export const REMOVED_MESSAGE = 'Cet objectif a été supprimé ou ne vous est plus partagé.';

/**
 * Client state of the objectives feature, backed by the objectives API: every
 * change comes back as the objective's new state, computed by the server. Only
 * the display settings and recent searches stay in this browser. Failures are
 * exposed as `error` for the screens to display.
 */
@Injectable({ providedIn: 'root' })
export class ObjectivesStore {
  private readonly api = inject(ObjectivesApiService);
  private readonly appData = inject(PlanoDataStore);
  private readonly auth = inject(AuthService);
  private readonly clock = inject(APP_CLOCK);
  private readonly data = computed(() => this.appData.data().objectives);

  private readonly objectivesState = signal<readonly ObjectiveSummary[]>([]);
  private readonly detailState = signal<ObjectiveDetail | null>(null);
  private readonly agendaState = signal<readonly ObjectiveAgendaItem[]>([]);
  private readonly homeState = signal<readonly ObjectiveSummary[] | null>(null);
  private readonly templatesState = signal<readonly ObjectiveTemplateSummary[]>([]);
  private importing: Promise<void> | null = null;
  /** What screens have asked for, so live changes refresh it and nothing else. */
  private listRequested = false;
  private homeRequested = false;
  private agendaRequested = false;

  /** The top of what the user can see, in their own order. */
  readonly objectives = this.objectivesState.asReadonly();
  /** The objective open in the detail screen, at any level. */
  readonly detail = this.detailState.asReadonly();
  /** Dated items across every visible objective, for the agenda. */
  readonly agenda = this.agendaState.asReadonly();
  /** What is pinned to the home page; null until loaded. */
  readonly home = this.homeState.asReadonly();
  /** The structures the user saved to reuse. */
  readonly templates = this.templatesState.asReadonly();
  readonly loading = signal(false);
  /** Message of the last failed request, until cleared. */
  readonly error = signal('');
  readonly settings = computed(() => this.data().settings);
  readonly currentUserId = computed(() => this.auth.user()?.id ?? '');
  readonly recent = computed(() =>
    this.data()
      .recentIds.map((id) => this.find(id))
      .filter((objective): objective is ObjectiveSummary => !!objective),
  );
  /** Session-only filters, shared by the overview and the filter screen. */
  readonly filters = signal<ObjectiveFilters>(DEFAULT_OBJECTIVE_FILTERS);
  readonly activeFilterCount = computed(
    () => this.filters().statuses.length + this.filters().categories.length,
  );

  constructor() {
    inject(LiveUpdatesService)
      .events.pipe(takeUntilDestroyed())
      .subscribe((event) => void this.applyLive(event));
  }

  today(): IsoDate {
    return toIsoDate(this.clock());
  }

  find(id: string): ObjectiveSummary | undefined {
    return this.objectives().find((objective) => objective.id === id);
  }

  async load(): Promise<void> {
    this.listRequested = true;
    this.loading.set(true);
    if (this.data().items.length) await this.importLocal();
    await this.run(this.api.findAll(), (objectives) => this.objectivesState.set(objectives));
    this.loading.set(false);
  }

  /** Loads an objective for the detail screen; false when it is missing or hidden. */
  async open(id: string): Promise<boolean> {
    this.loading.set(true);
    if (this.detailState()?.id !== id) this.detailState.set(null);
    if (this.data().items.length) await this.importLocal();
    const found = await this.run(this.api.findOne(id), (detail) => this.detailState.set(detail));
    this.loading.set(false);
    return found;
  }

  async loadHome(): Promise<void> {
    this.homeRequested = true;
    if (this.data().items.length) await this.importLocal();
    await this.refreshHome();
  }

  async loadAgenda(): Promise<void> {
    this.agendaRequested = true;
    if (this.data().items.length) await this.importLocal();
    try {
      this.agendaState.set(await firstValueFrom(this.api.findAgenda()));
    } catch {
      // The agenda still shows everything else; the next visit catches up.
    }
  }

  /** Objectives for an overview tab, after filters and sorting. */
  query(tab: ObjectiveTab): ObjectiveSummary[] {
    const { statuses, categories, sort, direction } = this.filters();
    const showArchived = this.settings().showArchived;
    const inTab = (objective: ObjectiveSummary): boolean => {
      if (tab === 'archived') return objective.archived;
      if (objective.archived && !(tab === 'all' && showArchived)) return false;
      if (tab === 'mine') return objective.role === 'owner';
      if (tab === 'shared') return objective.role !== 'owner' || objective.sharing !== 'private';
      return true;
    };
    const factor = direction === 'asc' ? 1 : -1;
    const compare = (first: ObjectiveSummary, second: ObjectiveSummary): number => {
      if (sort === 'manual') return 0;
      if (sort === 'progress') return (first.percent ?? -1) - (second.percent ?? -1);
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

  search(query: string): ObjectiveSummary[] {
    const needle = normalizeText(query);
    if (!needle) return [];
    return this.objectives().filter((objective) =>
      [objective.title, categoryMeta(objective.category).label].some((text) =>
        normalizeText(text).includes(needle),
      ),
    );
  }

  /** Moves an objective onto another one's place, locally: call saveOrder() on drop. */
  moveObjective(id: string, targetId: string): void {
    const items = [...this.objectives()];
    const from = items.findIndex((objective) => objective.id === id);
    const to = items.findIndex((objective) => objective.id === targetId);
    if (from < 0 || to < 0 || from === to) return;
    const [moved] = items.splice(from, 1);
    items.splice(to, 0, moved);
    this.objectivesState.set(items);
  }

  /** Saves the user's order; on failure, the order the server still has comes back. */
  async saveOrder(): Promise<boolean> {
    const saved = await this.run(this.api.reorder(this.objectives().map(({ id }) => id)), () => undefined);
    if (!saved) await this.load();
    return saved;
  }

  /** Same for the sub-objectives of the open objective, which everyone sees in one order. */
  moveChild(id: string, targetId: string): void {
    const detail = this.detailState();
    if (!detail) return;
    const children = [...detail.children];
    const from = children.findIndex((child) => child.id === id);
    const to = children.findIndex((child) => child.id === targetId);
    if (from < 0 || to < 0 || from === to) return;
    const [moved] = children.splice(from, 1);
    children.splice(to, 0, moved);
    this.detailState.set({ ...detail, children });
  }

  async saveChildOrder(): Promise<boolean> {
    const detail = this.detailState();
    if (!detail) return false;
    const saved = await this.apply(this.api.reorderChildren(detail.id, detail.children.map(({ id }) => id)));
    if (!saved) await this.open(detail.id);
    return saved;
  }

  async create(details: CreateObjectiveRequest): Promise<ObjectiveDetail | null> {
    let created: ObjectiveDetail | null = null;
    await this.run(this.api.create(details), (detail) => {
      created = detail;
      this.detailState.set(detail);
      if (!detail.parentId) this.objectivesState.update((items) => [...items, detail]);
    });
    return created;
  }

  update(id: string, changes: UpdateObjectiveRequest): Promise<boolean> {
    return this.apply(this.api.update(id, changes));
  }

  async remove(id: string): Promise<boolean> {
    const removed = await this.run(this.api.remove(id), () => {
      if (this.detailState()?.id === id) this.detailState.set(null);
      this.objectivesState.update((items) => items.filter((objective) => objective.id !== id));
    });
    if (removed) {
      this.updateData((data) => ({ ...data, recentIds: data.recentIds.filter((recentId) => recentId !== id) }));
    }
    return removed;
  }

  async updatePreferences(id: string, changes: UpdateObjectivePreferencesRequest): Promise<boolean> {
    const updated = await this.apply(this.api.updatePreferences(id, changes));
    if (updated && this.homeRequested && changes.onHome !== undefined) await this.refreshHome();
    return updated;
  }

  addSession(id: string, details: AddObjectiveSessionRequest): Promise<boolean> {
    return this.apply(this.api.addSession(id, details));
  }

  removeSession(id: string, sessionId: string): Promise<boolean> {
    return this.apply(this.api.removeSession(id, sessionId));
  }

  setCheckIn(id: string, date: IsoDate, checked: boolean): Promise<boolean> {
    return this.apply(this.api.setCheckIn(id, date, checked));
  }

  setProgress(id: string, percent: number): Promise<boolean> {
    return this.apply(this.api.setProgress(id, percent));
  }

  setCompleted(id: string, completed: boolean): Promise<boolean> {
    return this.apply(this.api.setCompleted(id, completed));
  }

  addMember(id: string, details: AddObjectiveMemberRequest): Promise<boolean> {
    return this.apply(this.api.addMember(id, details));
  }

  updateMemberRole(id: string, userId: string, role: ObjectiveMemberRole): Promise<boolean> {
    return this.apply(this.api.updateMember(id, userId, role));
  }

  removeMember(id: string, userId: string): Promise<boolean> {
    return this.apply(this.api.removeMember(id, userId));
  }

  /** Gives up what was shared in this objective's tree: it leaves the screens. */
  async leave(id: string): Promise<boolean> {
    return this.run(this.api.leave(id), () => {
      this.detailState.set(null);
      this.objectivesState.update((items) => items.filter((objective) => objective.id !== id));
    });
  }

  /** Ticks a sub-objective from its parent, whose state then changes too. */
  async setChildCompleted(childId: string, completed: boolean): Promise<boolean> {
    const parentId = this.detailState()?.id;
    const done = await this.run(this.api.setCompleted(childId, completed), () => undefined);
    if (done && parentId) await this.run(this.api.findOne(parentId), (detail) => this.detailState.set(detail));
    return done;
  }

  async loadTemplates(): Promise<void> {
    await this.silently(this.api.findTemplates(), (templates) => this.templatesState.set(templates));
  }

  saveTemplate(id: string, name: string): Promise<boolean> {
    return this.run(this.api.saveTemplate(id, name), (template) =>
      this.templatesState.update((templates) => [...templates, template]),
    );
  }

  removeTemplate(templateId: string): Promise<boolean> {
    return this.run(this.api.removeTemplate(templateId), () =>
      this.templatesState.update((templates) => templates.filter(({ id }) => id !== templateId)),
    );
  }

  /** A new objective with this structure, which opens. */
  async useTemplate(templateId: string, startDate: IsoDate): Promise<ObjectiveDetail | null> {
    let created: ObjectiveDetail | null = null;
    await this.run(this.api.useTemplate(templateId, startDate), (detail) => {
      created = detail;
      this.detailState.set(detail);
      this.objectivesState.update((items) => [...items, detail]);
    });
    return created;
  }

  /** Remembers a top-level objective for the search screen. */
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

  /** A failure keeps what is shown: the next visit catches up. */
  private async refreshHome(): Promise<void> {
    try {
      this.homeState.set(await firstValueFrom(this.api.findHome()));
    } catch {
      this.homeState.update((home) => home ?? []);
    }
  }

  private async applyLive(event: LiveEvent): Promise<void> {
    if (event.type === 'objective.removed') {
      if (this.detailState()?.id === event.objectiveId) {
        this.detailState.set(null);
        this.error.set(REMOVED_MESSAGE);
      }
      this.objectivesState.update((items) => items.filter(({ id }) => id !== event.objectiveId));
    } else if (event.type !== 'objective.changed') {
      return;
    }
    await Promise.all([
      this.reloadOpenObjective(),
      this.listRequested ? this.silently(this.api.findAll(), (items) => this.objectivesState.set(items)) : null,
      this.homeRequested ? this.refreshHome() : null,
      this.agendaRequested ? this.silently(this.api.findAgenda(), (items) => this.agendaState.set(items)) : null,
    ]);
  }

  /** Any change in a tree can move the bars of what is open. */
  private async reloadOpenObjective(): Promise<void> {
    const id = this.detailState()?.id;
    if (!id) return;
    try {
      const detail = await firstValueFrom(this.api.findOne(id));
      if (this.detailState()?.id === id) this.detailState.set(detail);
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 404 && this.detailState()?.id === id) {
        this.detailState.set(null);
        this.error.set(REMOVED_MESSAGE);
      }
    }
  }

  /** A reload nobody asked for stays quiet when it fails. */
  private async silently<T>(request: Observable<T>, apply: (result: T) => void): Promise<void> {
    try {
      apply(await firstValueFrom(request));
    } catch {
      // The next event or screen visit catches up.
    }
  }

  /**
   * Sends what this browser still holds to the API, then forgets it. On failure
   * it stays here and goes again on the next load. Runs once at a time, whichever
   * screen asks first.
   */
  private importLocal(): Promise<void> {
    const { items } = this.data();
    this.importing ??= (async () => {
      try {
        const today = this.today();
        await firstValueFrom(
          this.api.importLocal({ objectives: items.map((objective) => toImportRequest(objective, today)) }),
        );
        this.updateData((data) => ({ ...data, items: [], contacts: [], recentIds: [] }));
      } catch {
        // Nothing is lost: the objectives are still in this browser.
      } finally {
        this.importing = null;
      }
    })();
    return this.importing;
  }

  /** Runs a change that answers with the objective's new state. */
  private apply(request: Observable<ObjectiveDetail>): Promise<boolean> {
    return this.run(request, (detail) => {
      this.detailState.set(detail);
      this.objectivesState.update((items) =>
        items.map((objective) => (objective.id === detail.id ? detail : objective)),
      );
    });
  }

  private async run<T>(request: Observable<T>, apply: (result: T) => void): Promise<boolean> {
    this.error.set('');
    try {
      apply(await firstValueFrom(request));
      return true;
    } catch (error) {
      this.error.set(httpErrorMessage(error, { fallback: FAILURE_MESSAGE, useServerMessage: true }));
      return false;
    }
  }

  private updateData(change: (data: ObjectivesData) => ObjectivesData): void {
    this.appData.update((data) => ({ ...data, objectives: change(data.objectives) }));
  }
}
