import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  DEFAULT_AGENDA_CALENDARS,
  DEFAULT_AGENDA_FILTERS,
  type AgendaUserSettings,
} from '@plano/common';
import type {
  AgendaContact,
  AgendaEventView,
  Contact,
  AgendaData,
  AgendaEvent,
  AgendaFilters,
  AgendaSettings,
  IsoDate,
  LocalDateTime,
  SaveAgendaEventRequest,
} from '@plano/common';
import { Observable, filter, firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { PlanoDataStore } from '../../core/data/plano-data.store';
import { AgendaSettingsStore } from '../../core/settings/agenda-settings.store';
import { FriendsService } from '../../core/friends/friends.service';
import { httpErrorMessage } from '../../core/http/http-error-message';
import { LiveUpdatesService } from '../../core/live/live-updates.service';
import { initialsOf, personColor, toPerson } from '../../core/people/people';
import { APP_CLOCK, normalizeText, toIsoDate, toTimeOfDay } from '../../core/time/dates';
import { ListsStore } from '../lists/lists.store';
import { categoryMeta, importBatches } from '../objectives/objective.utils';
import { ObjectivesStore } from '../objectives/objectives.store';
import { AgendaApiService } from './agenda-api.service';

import {
  AgendaItem,
  EVENT_COLORS,
  addMinutes,
  coveredDates,
  datePart,
  eventColor,
  minutesBetween,
  nextOccurrence,
  occurrencesBetween,
  toImportRequest,
  toLocalDateTime,
} from './agenda.utils';

export type AgendaEventDraft = Omit<AgendaEvent, 'id'>;

/** An invitable user as the agenda screens show participants. */
export function toAgendaContact(contact: Contact): AgendaContact {
  return {
    id: contact.id,
    name: `${contact.firstName} ${contact.lastName}`.trim() || contact.username,
    initials: initialsOf(contact.firstName, contact.lastName) || contact.username.slice(0, 2).toUpperCase(),
    color: personColor(contact.id),
    frequent: contact.friend,
    avatarVersion: contact.avatarVersion,
  };
}

const MAX_RECENT = 5;
/** The API takes at most this many events per import request. */
const IMPORT_BATCH_EVENTS = 200;

/** An organiser or guest as the agenda screens show participants. */
function toEventContact(person: Pick<AgendaContact, 'id' | 'name' | 'avatarVersion'>): AgendaContact {
  return { ...toPerson(person), frequent: false };
}

@Injectable({ providedIn: 'root' })
export class AgendaStore {
  private readonly appData = inject(PlanoDataStore);
  private readonly clock = inject(APP_CLOCK);
  private readonly lists = inject(ListsStore);
  private readonly objectives = inject(ObjectivesStore);
  private readonly friends = inject(FriendsService);
  private readonly api = inject(AgendaApiService);
  private readonly auth = inject(AuthService);
  private readonly preferences = inject(AgendaSettingsStore);
  /** What this browser held before the agenda moved to the API, until imported. */
  private readonly data = computed(() => this.appData.data().agenda);
  private readonly invitableState = signal<readonly Contact[]>([]);
  private readonly userId = computed(() => this.auth.user()?.id ?? null);
  /** What the API sent, and for whom: another account starts empty. */
  private readonly served = signal<{ userId: string | null; events: readonly AgendaEventView[] } | null>(null);
  private readonly all = computed(() => {
    const served = this.served();
    return served && served.userId === this.userId() ? served.events : [];
  });
  private loading: Promise<void> | null = null;
  private importing: Promise<void> | null = null;
  /** A screen asked for the events, so live changes refresh them. */
  private requested = false;

  /** The built-in calendars, in the colours the user chose. */
  readonly calendars = computed(() => {
    const colors = this.preferences.settings().calendarColors;
    return DEFAULT_AGENDA_CALENDARS.map((calendar) => ({ ...calendar, color: colors[calendar.id] ?? calendar.color }));
  });
  /** Contacts of the seed data, still shown on the events that mention them. */
  readonly contacts = computed(() => this.data().contacts);
  /** Who can be invited: the user's friends and group mates, from the API (see loadContacts). */
  readonly invitable = this.invitableState.asReadonly();
  /** What the agenda shows: the user's own events and the invitations they accepted. */
  readonly events = computed(() => this.all().filter((event) => event.status === 'accepted'));
  /** Invitations waiting for an answer, soonest first. */
  readonly invitations = computed(() => this.all().filter((event) => event.status === 'pending'));
  /** Message of the last failed change, until the next one succeeds. */
  readonly error = signal('');
  /** Organisers and guests of the events, so they show by name even when they are no contact. */
  private readonly people = computed(() => {
    const people = new Map<string, AgendaContact>();
    for (const event of this.all()) {
      for (const person of [event.owner, ...event.attendees]) {
        if (!people.has(person.id)) people.set(person.id, toEventContact(person));
      }
    }
    return people;
  });
  readonly settings: Signal<AgendaUserSettings> = this.preferences.settings;
  readonly filters: Signal<AgendaFilters> = this.preferences.settings;
  readonly activeFilterCount = computed(() => {
    const filters = this.filters();
    return (
      filters.hiddenCalendarIds.length +
      Number(!filters.showEvents) +
      Number(!filters.showTasks) +
      Number(!filters.showPastEvents)
    );
  });
  readonly recent = computed(() =>
    this.settings()
      .recentIds.map((id) => this.event(id))
      .filter((event): event is AgendaEventView => !!event),
  );

  constructor() {
    inject(LiveUpdatesService)
      .events.pipe(
        filter(({ type }) => type === 'agenda.changed'),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        if (this.requested) void this.refresh();
      });
  }

  /** Fetches the dated items of other features served by the API (reminders, objectives). */
  loadTasks(): void {
    void this.lists.loadReminders();
    void this.objectives.loadAgenda();
  }

  /** The events and the dated items of other features, for a screen outside the agenda. */
  load(): Promise<void> {
    this.loadTasks();
    return this.refresh();
  }

  /** Entering the agenda: the first visit waits for the events, the next ones refresh them behind. */
  enter(): Promise<void> {
    if (!this.loaded()) return this.ensureLoaded();
    void this.refresh();
    return Promise.resolve();
  }

  /** Loads the events (and the settings they are shown with) the first time only. */
  ensureLoaded(): Promise<void> {
    if (this.loaded()) return this.preferences.load();
    this.loading ??= Promise.all([this.refresh(), this.preferences.load()])
      .then(() => undefined)
      .finally(() => (this.loading = null));
    return this.loading;
  }

  private loaded(): boolean {
    const served = this.served();
    return !!served && served.userId === this.userId();
  }

  /** An event the agenda does not hold (a declined invitation opened from a link); false when hidden. */
  async open(id: string): Promise<boolean> {
    if (this.event(id)) return true;
    try {
      this.upsert(await firstValueFrom(this.api.findOne(id)));
      return true;
    } catch {
      return false;
    }
  }

  today(): IsoDate {
    return toIsoDate(this.clock());
  }

  now(): LocalDateTime {
    const now = this.clock();
    return toLocalDateTime(toIsoDate(now), toTimeOfDay(now));
  }

  /** Any event the user can open, invitations included. */
  event(id: string): AgendaEventView | undefined {
    return this.all().find((event) => event.id === id);
  }

  calendar(id: string) {
    return this.calendars().find((calendar) => calendar.id === id);
  }

  contact(id: string): AgendaContact | undefined {
    const invitable = this.invitableState().find((contact) => contact.id === id);
    if (invitable) return toAgendaContact(invitable);
    return this.people().get(id) ?? this.contacts().find((contact) => contact.id === id);
  }

  /** Refreshes who can be invited; false when the API could not answer. */
  async loadContacts(): Promise<boolean> {
    try {
      this.invitableState.set(await firstValueFrom(this.friends.contacts()));
      return true;
    } catch {
      return false;
    }
  }

  colorOf(event: AgendaEvent): string {
    return eventColor(event, this.calendars());
  }

  /** Visible events (occurrences) and dated tasks touching [from, to], in display order. */
  itemsBetween(from: IsoDate, to: IsoDate): AgendaItem[] {
    const filters = this.filters();
    const items = [
      ...(filters.showEvents ? this.eventItems(from, to, filters) : []),
      ...(filters.showTasks ? this.taskItems(from, to) : []),
    ];
    return items.sort(
      (first, second) =>
        Number(second.allDay) - Number(first.allDay) || first.start.localeCompare(second.start),
    );
  }

  itemsOn(date: IsoDate): AgendaItem[] {
    return this.itemsBetween(date, date).filter((item) =>
      coveredDates({ start: item.start, end: item.end }).includes(date),
    );
  }

  /** Searches title, place, notes, calendar and participant names, accent-insensitively. */
  search(query: string): AgendaEvent[] {
    const needle = normalizeText(query);
    if (!needle) return [];
    return this.events().filter((event) =>
      [
        event.title,
        event.location,
        event.description,
        event.notes,
        this.calendar(event.calendarId)?.name ?? '',
        ...event.participantIds.map((id) => this.contact(id)?.name ?? ''),
      ].some((text) => normalizeText(text).includes(needle)),
    );
  }

  /** Date to open an event on: its next occurrence from today, else its first one. */
  displayDate(event: AgendaEvent): IsoDate {
    return datePart(nextOccurrence(event, this.today())?.start ?? event.start);
  }

  create(draft: AgendaEventDraft): Promise<AgendaEventView | null> {
    return this.save(this.api.create(this.normalized(draft)));
  }

  /** Organiser only: guests no longer listed lose it, new ones are invited. */
  update(id: string, draft: AgendaEventDraft): Promise<AgendaEventView | null> {
    return this.save(this.api.update(id, this.normalized(draft)));
  }

  /** Deletes the event for everyone on it and, for recurring ones, the whole series. */
  async remove(id: string): Promise<boolean> {
    try {
      await firstValueFrom(this.api.remove(id));
    } catch (error) {
      this.error.set(
        httpErrorMessage(error, { fallback: 'La suppression a échoué. Réessayez.', useServerCode: true }),
      );
      return false;
    }
    this.error.set('');
    this.served.update(
      (served) => served && { ...served, events: served.events.filter((event) => event.id !== id) },
    );
    this.forgetRecent(id);
    return true;
  }

  /** A guest's answer. Accepting files the event in their first visible calendar, with their usual reminder. */
  async respond(id: string, status: 'accepted' | 'declined'): Promise<boolean> {
    const hidden = this.filters().hiddenCalendarIds;
    const calendar =
      this.calendars().find((candidate) => !hidden.includes(candidate.id)) ?? this.calendars()[0];
    const answer =
      status === 'accepted'
        ? { status, calendarId: calendar?.id, reminderMinutes: this.settings().defaultReminderMinutes }
        : { status };
    const view = await this.save(this.api.respond(id, answer));
    if (view && status === 'declined') this.forgetRecent(id);
    return !!view;
  }

  markViewed(id: string): void {
    const recentIds = this.settings().recentIds;
    if (recentIds[0] === id) return;
    this.preferences.update({
      recentIds: [id, ...recentIds.filter((recentId) => recentId !== id)].slice(0, MAX_RECENT),
    });
  }

  updateSettings(changes: Partial<AgendaSettings>): void {
    this.preferences.update(changes);
  }

  updateFilters(changes: Partial<AgendaFilters>): void {
    this.preferences.update(changes);
  }

  toggleCalendar(id: string): void {
    const hidden = this.filters().hiddenCalendarIds;
    this.updateFilters({
      hiddenCalendarIds: hidden.includes(id) ? hidden.filter((other) => other !== id) : [...hidden, id],
    });
  }

  /** Recolors a calendar: its events follow, except those with a color of their own. */
  setCalendarColor(id: string, color: string): void {
    if (!EVENT_COLORS.includes(color) || !this.calendar(id)) return;
    this.preferences.update({ calendarColors: { ...this.settings().calendarColors, [id]: color } });
  }

  resetFilters(): void {
    this.updateFilters(DEFAULT_AGENDA_FILTERS);
  }

  /** Guarantees a positive duration; all-day events cover whole days. Guests once each, never the user. */
  private normalized(draft: AgendaEventDraft): SaveAgendaEventRequest {
    const userId = this.userId();
    const event = { ...draft, participantIds: [...new Set(draft.participantIds)].filter((id) => id !== userId) };
    const title = event.title.trim();
    if (event.allDay) {
      const lastDay = datePart(event.end) < datePart(event.start) ? datePart(event.start) : datePart(event.end);
      return {
        ...event,
        title,
        start: toLocalDateTime(datePart(event.start), '00:00'),
        end: toLocalDateTime(lastDay, '23:59'),
      };
    }
    const end = minutesBetween(event.start, event.end) > 0
      ? event.end
      : addMinutes(event.start, this.settings().defaultDurationMinutes);
    return { ...event, title, end };
  }

  private eventItems(from: IsoDate, to: IsoDate, filters: AgendaFilters): AgendaItem[] {
    const now = this.now();
    return this.events()
      .filter((event) => !filters.hiddenCalendarIds.includes(event.calendarId))
      .flatMap((event) =>
        occurrencesBetween(event, from, to)
          .filter((occurrence) => filters.showPastEvents || occurrence.end >= now)
          .map((occurrence): AgendaItem => ({
            key: `${event.id}@${datePart(occurrence.start)}`,
            kind: 'event',
            eventId: event.id,
            title: event.title,
            subtitle: event.location,
            color: this.colorOf(event),
            allDay: event.allDay,
            start: occurrence.start,
            end: occurrence.end,
            participantIds: event.participantIds,
            done: false,
            link: ['/agenda/events', event.id],
            queryParams: { date: datePart(occurrence.start) },
          })),
      );
  }

  /** Dated items owned by other features, so the agenda shows the whole day. */
  private taskItems(from: IsoDate, to: IsoDate): AgendaItem[] {
    const inRange = (date: IsoDate): boolean => date >= from && date <= to;

    const listTasks = this.lists
      .reminders()
      .filter((task) => inRange(datePart(task.reminder)))
      .map((task): AgendaItem => ({
        key: `list:${task.listId}:${task.entryId}`,
        kind: 'task',
        eventId: null,
        title: task.name,
        subtitle: `Liste · ${task.listName}`,
        color: task.listColor,
        allDay: false,
        start: task.reminder,
        end: task.reminder,
        participantIds: [],
        done: task.done,
        link: ['/lists', task.listId],
        queryParams: {},
      }));

    const objectiveTasks = this.objectives
      .agenda()
      .filter((item) => inRange(item.date))
      .map((item): AgendaItem => ({
        key: `objective:${item.key}`,
        kind: 'task',
        eventId: null,
        title: item.kind === 'deadline' ? `Échéance : ${item.label}` : item.label,
        subtitle: `Objectif · ${item.objectiveTitle}`,
        color: categoryMeta(item.category).color,
        allDay: true,
        start: toLocalDateTime(item.date, '00:00'),
        end: toLocalDateTime(item.date, '23:59'),
        participantIds: [],
        done: false,
        link: ['/objectives', item.objectiveId, ...(item.kind === 'session' ? ['calendar'] : [])],
        queryParams: {},
      }));

    return [...listTasks, ...objectiveTasks];
  }

  private async refresh(): Promise<void> {
    this.requested = true;
    if (this.data().events.length) await this.importLocal();
    const userId = this.userId();
    try {
      const events = await firstValueFrom(this.api.findAll());
      this.served.set({ userId, events });
    } catch {
      // Offline: what is shown stays; the next visit or live event catches up.
    }
  }

  private async save(request: Observable<AgendaEventView>): Promise<AgendaEventView | null> {
    try {
      const view = await firstValueFrom(request);
      this.error.set('');
      this.upsert(view);
      return view;
    } catch (error) {
      this.error.set(
        httpErrorMessage(error, { fallback: 'L’enregistrement a échoué. Réessayez.', useServerCode: true }),
      );
      return null;
    }
  }

  private upsert(view: AgendaEventView): void {
    const userId = this.userId();
    this.served.update((served) => {
      const events = served && served.userId === userId ? served.events : [];
      return {
        userId,
        events: events.some(({ id }) => id === view.id)
          ? events.map((event) => (event.id === view.id ? view : event))
          : [...events, view],
      };
    });
  }

  private forgetRecent(id: string): void {
    const recentIds = this.settings().recentIds;
    if (!recentIds.includes(id)) return;
    this.preferences.update({ recentIds: recentIds.filter((recentId) => recentId !== id) });
  }

  /**
   * Sends what this browser still holds to the API, then forgets it. On failure
   * it stays here and goes again on the next load. Runs once at a time.
   */
  private importLocal(): Promise<void> {
    const { events } = this.data();
    this.importing ??= (async () => {
      try {
        // Sending a batch twice is harmless: the API recognises what it already has.
        for (const batch of importBatches(events.map(toImportRequest), IMPORT_BATCH_EVENTS)) {
          await firstValueFrom(this.api.importLocal({ events: batch }));
        }
        // Their ids change on the way: the recent searches would point nowhere.
        this.updateData((data) => ({ ...data, events: [], contacts: [], recentIds: [] }));
      } catch {
        // Nothing is lost: the events are still in this browser.
      } finally {
        this.importing = null;
      }
    })();
    return this.importing;
  }

  private updateData(change: (data: AgendaData) => AgendaData): void {
    this.appData.update((data) => ({ ...data, agenda: change(data.agenda) }));
  }
}
