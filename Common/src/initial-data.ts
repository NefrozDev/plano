import type { AgendaData, ObjectivesData, PlanoData } from './models';

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
      filters: { hiddenCalendarIds: [], showEvents: true, showTasks: true, showPastEvents: true },
      recentIds: [],
    },
  });
}
