import { Injectable, computed, inject } from '@angular/core';
import type {
  AgendaContact,
  AgendaData,
  AgendaEvent,
  AgendaFilters,
  AgendaSettings,
  IsoDate,
  LocalDateTime,
} from '@plano/common';
import { PlanoDataStore } from '../../core/data/plano-data.store';
import { createPerson } from '../../core/people/people';
import { APP_CLOCK, createId, normalizeText, toIsoDate, toTimeOfDay } from '../../core/time/dates';
import { ListsStore } from '../lists/lists.store';
import { categoryMeta } from '../objectives/objective.utils';
import {
  AgendaItem,
  addMinutes,
  coveredDates,
  datePart,
  eventColor,
  minutesBetween,
  nextOccurrence,
  occurrencesBetween,
  toLocalDateTime,
} from './agenda.utils';

export type AgendaEventDraft = Omit<AgendaEvent, 'id'>;

export const DEFAULT_AGENDA_FILTERS: AgendaFilters = {
  hiddenCalendarIds: [],
  showEvents: true,
  showTasks: true,
  showPastEvents: true,
};

const MAX_RECENT = 5;

@Injectable({ providedIn: 'root' })
export class AgendaStore {
  private readonly appData = inject(PlanoDataStore);
  private readonly clock = inject(APP_CLOCK);
  private readonly lists = inject(ListsStore);
  private readonly data = computed(() => this.appData.data().agenda);

  readonly calendars = computed(() => this.data().calendars);
  readonly contacts = computed(() => this.data().contacts);
  readonly events = computed(() => this.data().events);
  readonly settings = computed(() => this.data().settings);
  readonly filters = computed(() => this.data().filters);
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
    this.data()
      .recentIds.map((id) => this.event(id))
      .filter((event): event is AgendaEvent => !!event),
  );

  /** Fetches the dated items of other features served by the API (list reminders). */
  loadTasks(): void {
    void this.lists.loadReminders();
  }

  today(): IsoDate {
    return toIsoDate(this.clock());
  }

  now(): LocalDateTime {
    const now = this.clock();
    return toLocalDateTime(toIsoDate(now), toTimeOfDay(now));
  }

  event(id: string): AgendaEvent | undefined {
    return this.events().find((event) => event.id === id);
  }

  calendar(id: string) {
    return this.calendars().find((calendar) => calendar.id === id);
  }

  contact(id: string): AgendaContact | undefined {
    return this.contacts().find((contact) => contact.id === id);
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

  create(draft: AgendaEventDraft): AgendaEvent {
    const event = this.normalized({ ...draft, id: createId('event') });
    this.updateData((data) => ({ ...data, events: [...data.events, event] }));
    return event;
  }

  update(id: string, draft: AgendaEventDraft): void {
    this.updateData((data) => ({
      ...data,
      events: data.events.map((event) => (event.id === id ? this.normalized({ ...draft, id }) : event)),
    }));
  }

  /** Deletes the event and, for recurring ones, the whole series. */
  remove(id: string): void {
    this.updateData((data) => ({
      ...data,
      events: data.events.filter((event) => event.id !== id),
      recentIds: data.recentIds.filter((recentId) => recentId !== id),
    }));
  }

  addContact(name: string): AgendaContact | null {
    const person = createPerson(name);
    if (!person) return null;
    const contact: AgendaContact = { ...person, frequent: false };
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

  updateSettings(changes: Partial<AgendaSettings>): void {
    this.updateData((data) => ({ ...data, settings: { ...data.settings, ...changes } }));
  }

  updateFilters(changes: Partial<AgendaFilters>): void {
    this.updateData((data) => ({ ...data, filters: { ...data.filters, ...changes } }));
  }

  toggleCalendar(id: string): void {
    const hidden = this.filters().hiddenCalendarIds;
    this.updateFilters({
      hiddenCalendarIds: hidden.includes(id) ? hidden.filter((other) => other !== id) : [...hidden, id],
    });
  }

  resetFilters(): void {
    this.updateFilters(DEFAULT_AGENDA_FILTERS);
  }

  /** Guarantees a positive duration; all-day events cover whole days. */
  private normalized(event: AgendaEvent): AgendaEvent {
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
    const data = this.appData.data();
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

    const sessionTasks = data.objectives.items
      .filter((objective) => !objective.archived)
      .flatMap((objective) =>
        objective.sessions
          .filter((session) => session.status === 'planned' && inRange(session.date))
          .map((session): AgendaItem => ({
            key: `objective:${objective.id}:${session.id}`,
            kind: 'task',
            eventId: null,
            title: session.label || objective.title,
            subtitle: `Objectif · ${objective.title}`,
            color: categoryMeta(objective.category).color,
            allDay: true,
            start: toLocalDateTime(session.date, '00:00'),
            end: toLocalDateTime(session.date, '23:59'),
            participantIds: [],
            done: false,
            link: ['/objectives', objective.id, 'calendar'],
            queryParams: {},
          })),
      );

    return [...listTasks, ...sessionTasks];
  }

  private updateData(change: (data: AgendaData) => AgendaData): void {
    this.appData.update((data) => ({ ...data, agenda: change(data.agenda) }));
  }
}
