import type { AgendaUserSettings } from './agenda';
import type { AgendaData, ObjectivesData, PlanoData } from './models';
import type { ObjectiveUserSettings } from './objectives';

/** Preferences a new account starts with; the mock data shares them. */
export const DEFAULT_OBJECTIVE_SETTINGS: ObjectivesData['settings'] = {
  defaultView: 'list',
  showArchived: false,
  defaultDueReminder: 'day-before',
  notifications: true,
  habitReminders: 'scheduled',
  showPercentage: true,
  categoryColors: true,
};

export const DEFAULT_AGENDA_SETTINGS: AgendaData['settings'] = {
  weekStartsOn: 1,
  defaultDurationMinutes: 60,
  timeZone: 'Europe/Brussels',
  defaultReminderMinutes: 15,
  eventNotifications: true,
  invitationNotifications: true,
  showWeekNumbers: false,
  hourFormat: '24h',
};

export const DEFAULT_AGENDA_FILTERS: AgendaData['filters'] = {
  hiddenCalendarIds: [],
  showEvents: true,
  showTasks: true,
  showPastEvents: true,
};

/** What the API answers for an account that never changed its settings (see the migrations' defaults). */
export const DEFAULT_AGENDA_USER_SETTINGS: AgendaUserSettings = {
  ...DEFAULT_AGENDA_SETTINGS,
  ...DEFAULT_AGENDA_FILTERS,
  calendarColors: {},
  recentIds: [],
};

export const DEFAULT_OBJECTIVE_USER_SETTINGS: ObjectiveUserSettings = {
  ...DEFAULT_OBJECTIVE_SETTINGS,
  recentIds: [],
};

/** Built-in calendars events are filed under; the event form needs at least one. */
export const DEFAULT_AGENDA_CALENDARS: AgendaData['calendars'] = [
  { id: 'personnel', name: 'Personnel', color: '#8b5cf6' },
  { id: 'travail', name: 'Travail', color: '#3264ed' },
  { id: 'famille', name: 'Famille', color: '#22a95a' },
  { id: 'anniversaires', name: 'Anniversaires', color: '#f59e0b' },
  { id: 'sport', name: 'Sport', color: '#e65591' },
];

/** What a new account starts with: default settings and calendars, no content. */
export function createEmptyPlanoData(): PlanoData {
  return structuredClone<PlanoData>({
    version: 1,
    dashboard: { tasks: [] },
    objectives: {
      currentUserId: 'me',
      items: [],
      contacts: [{ id: 'me', name: 'Vous', initials: 'V', color: '#325be2' }],
      settings: DEFAULT_OBJECTIVE_SETTINGS,
      recentIds: [],
    },
    agenda: {
      calendars: DEFAULT_AGENDA_CALENDARS,
      contacts: [],
      events: [],
      settings: DEFAULT_AGENDA_SETTINGS,
      filters: DEFAULT_AGENDA_FILTERS,
      recentIds: [],
    },
  });
}
