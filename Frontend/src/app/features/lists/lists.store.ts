import { Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type {
  CreateListRequest,
  HomeList,
  ListDetail,
  ListEntry,
  ListMemberRole,
  ListReminder,
  ListSection,
  ListSettings,
  ListSummary,
  LiveEvent,
  UpdateEntryRequest,
  UpdateListRequest,
  UpdateListSettingsRequest,
} from '@plano/common';
import { Observable, firstValueFrom } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { httpErrorMessage } from '../../core/http/http-error-message';
import { LiveUpdatesService } from '../../core/live/live-updates.service';
import { ListsApiService } from './lists-api.service';

export type { ListIcon, ListSettings, ListSummary } from '@plano/common';

const FAILURE_MESSAGE = 'L’action a échoué. Veuillez réessayer.';
export const REMOVED_MESSAGE = 'Cette liste a été supprimée ou ne vous est plus partagée.';

/** Recomputes the counts of a list from its entries. */
function withCounts(detail: ListDetail): ListDetail {
  const entries = detail.sections.flatMap((section) => section.entries);
  return {
    ...detail,
    completed: entries.filter((entry) => entry.done).length,
    total: entries.length,
  };
}

/**
 * Client state of the lists feature, backed by the lists API. Changes are
 * applied from the server's answers, except drag-and-drop ordering (local,
 * saved once on drop) and settings (applied at once, rolled back on failure).
 * Failures are exposed as `error` for the screens to display.
 */
@Injectable({ providedIn: 'root' })
export class ListsStore {
  private readonly api = inject(ListsApiService);

  private readonly listsState = signal<readonly ListSummary[]>([]);
  private readonly detailState = signal<ListDetail | null>(null);
  private readonly settingsState = signal<ListSettings | null>(null);
  private readonly remindersState = signal<readonly ListReminder[]>([]);
  private readonly homeState = signal<readonly HomeList[] | null>(null);
  private homeRequested = false;
  private remindersRequested = false;
  /** Whether a screen shows the overview, so live changes refresh it. */
  private listsRequested = false;

  readonly lists = this.listsState.asReadonly();
  /** The list currently open in the detail screen. */
  readonly detail = this.detailState.asReadonly();
  /** Null until loaded. */
  readonly settings = this.settingsState.asReadonly();
  /** Entries with a reminder across every visible list, for the agenda. */
  readonly reminders = this.remindersState.asReadonly();
  /** Lists pinned to the home page; null until loaded. */
  readonly home = this.homeState.asReadonly();
  readonly loading = signal(false);
  /** Message of the last failed request, until cleared. */
  readonly error = signal('');

  constructor() {
    inject(LiveUpdatesService)
      .events.pipe(takeUntilDestroyed())
      .subscribe((event) => void this.applyLive(event));
  }

  async loadLists(): Promise<void> {
    this.listsRequested = true;
    this.loading.set(true);
    await Promise.all([
      this.run(this.api.findAll(), (lists) => this.listsState.set(lists)),
      this.ensureSettings(),
    ]);
    this.loading.set(false);
  }

  /** Loads a list for the detail screen; false when it is missing or hidden. */
  async open(listId: string): Promise<boolean> {
    this.loading.set(true);
    if (this.detailState()?.id !== listId) this.detailState.set(null);
    const [found] = await Promise.all([
      this.run(this.api.findOne(listId), (detail) => this.detailState.set(detail)),
      this.ensureSettings(),
    ]);
    this.loading.set(false);
    return found;
  }

  async createList(details: CreateListRequest): Promise<ListDetail | null> {
    let created: ListDetail | null = null;
    await this.run(this.api.create(details), (detail) => {
      created = detail;
      this.detailState.set(detail);
      this.listsState.update((lists) => [...lists, detail]);
    });
    return created;
  }

  updateList(changes: UpdateListRequest): Promise<boolean> {
    return this.runOnDetail((id) => this.api.update(id, changes), (detail) => detail);
  }

  /** Deletes the open list, or the one given (from the overview). */
  async deleteList(id = this.detailState()?.id): Promise<boolean> {
    if (!id) return false;
    const deleted = await this.run(this.api.remove(id), () => {
      if (this.detailState()?.id === id) this.detailState.set(null);
      this.listsState.update((lists) => lists.filter((list) => list.id !== id));
    });
    if (deleted) {
      this.refreshReminders();
      this.refreshHome();
    }
    return deleted;
  }

  addSection(name: string, color: string): Promise<boolean> {
    return this.runOnDetail(
      (id) => this.api.addSection(id, { name, color }),
      (section, detail) => ({ ...detail, sections: [...detail.sections, section] }),
    );
  }

  renameSection(sectionId: string, name: string): Promise<boolean> {
    return this.runOnDetail(
      (id) => this.api.renameSection(id, sectionId, { name }),
      (_, detail) => this.mapSection(detail, sectionId, (section) => ({ ...section, name })),
    );
  }

  /** The section goes with its entries, reminders included. */
  async removeSection(sectionId: string): Promise<boolean> {
    const removed = await this.runOnDetail(
      (id) => this.api.removeSection(id, sectionId),
      (_, detail) => ({ ...detail, sections: detail.sections.filter((section) => section.id !== sectionId) }),
    );
    if (removed) this.refreshReminders();
    return removed;
  }

  addEntry(sectionId: string, name: string): Promise<boolean> {
    return this.runOnDetail(
      (id) => this.api.addEntry(id, sectionId, { name }),
      (entry, detail) =>
        this.mapSection(detail, sectionId, (section) => ({
          ...section,
          entries: [...section.entries, entry],
        })),
    );
  }

  async updateEntry(entryId: string, changes: UpdateEntryRequest): Promise<boolean> {
    const updated = await this.runOnDetail(
      (id) => this.api.updateEntry(id, entryId, changes),
      (entry, detail) => this.mapEntries(detail, (current) => (current.id === entryId ? entry : current)),
    );
    if (updated) this.refreshReminders();
    return updated;
  }

  toggleEntry(entry: ListEntry): Promise<boolean> {
    return this.updateEntry(entry.id, { done: !entry.done });
  }

  async removeEntry(entryId: string): Promise<boolean> {
    const removed = await this.runOnDetail(
      (id) => this.api.removeEntry(id, entryId),
      (_, detail) => ({
        ...detail,
        sections: detail.sections.map((section) => ({
          ...section,
          entries: section.entries.filter((entry) => entry.id !== entryId),
        })),
      }),
    );
    if (removed) this.refreshReminders();
    return removed;
  }

  /** Moves an entry onto another one's position, locally: call saveOrder() on drop. */
  moveEntry(sectionId: string, entryId: string, targetEntryId: string): void {
    const detail = this.detailState();
    if (!detail) return;
    this.detailState.set(
      this.mapSection(detail, sectionId, (section) => {
        const from = section.entries.findIndex((entry) => entry.id === entryId);
        const to = section.entries.findIndex((entry) => entry.id === targetEntryId);
        if (from < 0 || to < 0 || from === to) return section;
        const entries = [...section.entries];
        const [moved] = entries.splice(from, 1);
        entries.splice(to, 0, moved);
        return { ...section, entries };
      }),
    );
  }

  /** Moves a section onto another one's position, locally: call saveSectionOrder() on drop. */
  moveSection(sectionId: string, targetSectionId: string): void {
    const detail = this.detailState();
    if (!detail) return;
    const from = detail.sections.findIndex(({ id }) => id === sectionId);
    const to = detail.sections.findIndex(({ id }) => id === targetSectionId);
    if (from < 0 || to < 0 || from === to) return;
    const sections = [...detail.sections];
    const [moved] = sections.splice(from, 1);
    sections.splice(to, 0, moved);
    this.detailState.set({ ...detail, sections });
  }

  /** Moves a list onto another one's place in the overview, locally: call saveListOrder() on drop. */
  moveList(listId: string, targetListId: string): void {
    const lists = [...this.listsState()];
    const from = lists.findIndex(({ id }) => id === listId);
    const to = lists.findIndex(({ id }) => id === targetListId);
    if (from < 0 || to < 0 || from === to) return;
    const [moved] = lists.splice(from, 1);
    lists.splice(to, 0, moved);
    this.listsState.set(lists);
  }

  /** Saves the user's list order; on failure the overview is reloaded to the server's order. */
  async saveListOrder(): Promise<void> {
    const saved = await this.run(this.api.reorder(this.listsState().map(({ id }) => id)), () => undefined);
    if (!saved) {
      await this.run(this.api.findAll(), (lists) => this.listsState.set(lists));
      return;
    }
    this.refreshHome();
  }

  /** Pins the open list to (or unpins it from) the user's home page. */
  async setOnHome(onHome: boolean): Promise<boolean> {
    const listId = this.detailState()?.id;
    if (!listId) return false;
    const saved = await this.run(this.api.setOnHome(listId, onHome), () => {
      this.detailState.update((detail) => (detail?.id === listId ? { ...detail, onHome } : detail));
      this.listsState.update((lists) => lists.map((list) => (list.id === listId ? { ...list, onHome } : list)));
    });
    if (saved) this.refreshHome();
    return saved;
  }

  async loadHome(): Promise<void> {
    this.homeRequested = true;
    await this.run(this.api.findHome(), (home) => this.homeState.set(home));
  }

  /** Ticks an item from the home page, then refreshes the pinned lists. */
  async checkHomeEntry(listId: string, entryId: string): Promise<boolean> {
    const checked = await this.run(this.api.updateEntry(listId, entryId, { done: true }), () => undefined);
    if (checked) {
      this.refreshHome();
      this.refreshReminders();
    }
    return checked;
  }

  /** Saves the section order; on failure the list is reloaded to the server's order. */
  async saveSectionOrder(): Promise<void> {
    const detail = this.detailState();
    if (!detail) return;
    const saved = await this.run(
      this.api.reorderSections(detail.id, detail.sections.map(({ id }) => id)),
      () => undefined,
    );
    if (!saved) await this.open(detail.id);
  }

  /** Saves a section's order; on failure the list is reloaded to the server's order. */
  async saveOrder(sectionId: string): Promise<void> {
    const detail = this.detailState();
    const section = detail?.sections.find(({ id }) => id === sectionId);
    if (!detail || !section) return;
    const saved = await this.run(
      this.api.reorderEntries(detail.id, sectionId, section.entries.map(({ id }) => id)),
      () => undefined,
    );
    if (!saved) await this.open(detail.id);
  }

  addMember(userId: string, role: ListMemberRole): Promise<boolean> {
    return this.runOnDetail(
      (id) => this.api.addMember(id, { userId, role }),
      (member, detail) => ({
        ...detail,
        members: [...detail.members, member],
        memberCount: detail.memberCount + 1,
      }),
    );
  }

  updateMemberRole(userId: string, role: ListMemberRole): Promise<boolean> {
    return this.runOnDetail(
      (id) => this.api.updateMember(id, userId, role),
      (member, detail) => ({
        ...detail,
        members: detail.members.map((current) => (current.id === userId ? member : current)),
      }),
    );
  }

  /** The owner removes someone, or a member removes themself to leave the list. */
  async removeMember(userId: string): Promise<boolean> {
    const removed = await this.runOnDetail(
      (id) => this.api.removeMember(id, userId),
      (_, detail) => ({
        ...detail,
        members: detail.members.filter((member) => member.id !== userId),
        memberCount: detail.memberCount - 1,
      }),
    );
    if (removed) this.refreshReminders();
    return removed;
  }

  /** Everyone but the owner loses access. */
  async stopSharing(): Promise<boolean> {
    const stopped = await this.runOnDetail(
      (id) => this.api.removeAllMembers(id),
      (_, detail) => ({
        ...detail,
        members: detail.members.filter((member) => member.role === 'owner'),
        memberCount: 1,
      }),
    );
    if (stopped) this.refreshReminders();
    return stopped;
  }

  async updateSettings(changes: UpdateListSettingsRequest): Promise<void> {
    const previous = this.settingsState();
    if (!previous) return;
    this.settingsState.set({ ...previous, ...changes });
    const saved = await this.run(this.api.updateSettings(changes), (settings) =>
      this.settingsState.set(settings),
    );
    if (!saved) this.settingsState.set(previous);
  }

  /** Fetches reminders on first use, then keeps them fresh after entry changes. */
  async loadReminders(): Promise<void> {
    this.remindersRequested = true;
    await this.run(this.api.findReminders(), (reminders) => this.remindersState.set(reminders));
  }

  clearError(): void {
    this.error.set('');
  }

  /**
   * Someone (maybe this user on another device) changed a list: reload what is
   * on screen, quietly. A list that cannot be read any more counts as removed.
   */
  private async applyLive(event: LiveEvent): Promise<void> {
    if (event.type !== 'list.changed' && event.type !== 'list.removed') return;
    if (event.type === 'list.removed') {
      this.forget(event.listId);
      return;
    }
    if (this.detailState()?.id === event.listId) {
      try {
        const detail = await firstValueFrom(this.api.findOne(event.listId));
        if (this.detailState()?.id === event.listId) this.detailState.set(detail);
      } catch (error) {
        if (error instanceof HttpErrorResponse && error.status === 404) this.forget(event.listId);
      }
    }
    if (this.listsRequested) {
      try {
        this.listsState.set(await firstValueFrom(this.api.findAll()));
      } catch {
        // The overview stays as it was; its next load catches up.
      }
    }
    this.refreshReminders();
    this.refreshHome();
  }

  private forget(listId: string): void {
    this.listsState.update((lists) => lists.filter((list) => list.id !== listId));
    if (this.detailState()?.id === listId) {
      this.detailState.set(null);
      this.error.set(REMOVED_MESSAGE);
    }
    this.refreshReminders();
    this.refreshHome();
  }

  private refreshReminders(): void {
    if (this.remindersRequested) void this.loadReminders();
  }

  private refreshHome(): void {
    if (this.homeRequested) void this.loadHome();
  }

  private async ensureSettings(): Promise<void> {
    if (this.settingsState()) return;
    await this.run(this.api.findSettings(), (settings) => this.settingsState.set(settings));
  }

  /** Runs a request on the open list and applies its answer to that list. */
  private async runOnDetail<T>(
    request: (listId: string) => Observable<T>,
    apply: (value: T, detail: ListDetail) => ListDetail,
  ): Promise<boolean> {
    const listId = this.detailState()?.id;
    if (!listId) return false;
    return this.run(request(listId), (value) => {
      const detail = this.detailState();
      // Ignore a late answer for a list the user has already left.
      if (detail?.id === listId) this.detailState.set(withCounts(apply(value, detail)));
    });
  }

  private async run<T>(request: Observable<T>, apply: (value: T) => void): Promise<boolean> {
    try {
      apply(await firstValueFrom(request, { defaultValue: undefined as T }));
      return true;
    } catch (error) {
      this.error.set(httpErrorMessage(error, { useServerMessage: true, fallback: FAILURE_MESSAGE }));
      return false;
    }
  }

  private mapSection(
    detail: ListDetail,
    sectionId: string,
    update: (section: ListSection) => ListSection,
  ): ListDetail {
    return {
      ...detail,
      sections: detail.sections.map((section) => (section.id === sectionId ? update(section) : section)),
    };
  }

  private mapEntries(detail: ListDetail, update: (entry: ListEntry) => ListEntry): ListDetail {
    return {
      ...detail,
      sections: detail.sections.map((section) => ({ ...section, entries: section.entries.map(update) })),
    };
  }
}
