import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EnvironmentProviders, Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Routes, provideRouter } from '@angular/router';
import {
  createMockPlanoData,
  type ListReminder,
  type NotificationsResponse,
  type ObjectiveAgendaItem,
} from '@plano/common';
import { MemoryPlanoDataAdapter, PLANO_DATA_ADAPTER } from '../core/data/plano-data.adapter';
import { APP_CLOCK } from '../core/time/dates';

/** "Today" for every spec: Thursday 15 October 2026, 10:30, matching the seed data. */
export const TEST_TODAY = new Date(2026, 9, 15, 10, 30);

/**
 * Fresh in-memory seed data, a frozen clock, a router and a fake HTTP backend:
 * specs never touch localStorage or a server (flush API calls with HttpTestingController).
 */
export function providePlanoTesting(routes: Routes = []): (Provider | EnvironmentProviders)[] {
  return [
    provideRouter(routes),
    provideHttpClient(),
    provideHttpClientTesting(),
    { provide: APP_CLOCK, useValue: () => new Date(TEST_TODAY) },
    provideSeedData(),
  ];
}

/**
 * Starts the data store from the mock data (new accounts start empty), without its
 * objectives: those come from the API, and the browser only holds them to import.
 */
export function provideSeedData(): Provider {
  return {
    provide: PLANO_DATA_ADAPTER,
    useFactory: () => {
      const data = createMockPlanoData();
      return new MemoryPlanoDataAdapter({ ...data, objectives: { ...data.objectives, items: [], recentIds: [] } });
    },
  };
}

/** The list reminder the agenda shows on TEST_TODAY, as the lists API serves it. */
export const TEST_LIST_REMINDER: ListReminder = {
  listId: 'courses',
  listName: 'Courses',
  listColor: '#2ecb70',
  entryId: 'milk',
  name: 'Lait',
  done: false,
  reminder: '2026-10-15T18:00',
};

/** Answers the pending GET /lists/reminders request (made by the agenda and the dashboard). */
export function flushListReminders(reminders: ListReminder[] = [TEST_LIST_REMINDER]): void {
  TestBed.inject(HttpTestingController).expectOne('/api/v1/lists/reminders').flush(reminders);
}

/** Answers the pending GET /objectives/agenda request (made with the list reminders). */
export function flushObjectiveAgenda(items: ObjectiveAgendaItem[] = []): void {
  TestBed.inject(HttpTestingController).expectOne('/api/v1/objectives/agenda').flush(items);
}

/** Waits one macrotask, so every pending promise chain (e.g. after a flushed request) has run. */
export function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}

/** What the API answers for a user without notifications. */
export function emptyNotifications(): NotificationsResponse {
  return { items: [], unread: { friends: 0, lists: 0, objectives: 0, agenda: 0 } };
}
