import { inject } from '@angular/core';
import { signalStore } from '@ngrx/signals';
import {
  DEFAULT_AGENDA_CALENDARS,
  DEFAULT_AGENDA_FILTERS,
  DEFAULT_AGENDA_SETTINGS,
  DEFAULT_AGENDA_USER_SETTINGS,
  type AgendaCalendar,
  type AgendaUserSettings,
} from '@plano/common';
import { PlanoDataStore } from '../data/plano-data.store';
import {
  changedSettings,
  withAccountSettings,
  type BrowserSettings,
} from './with-account-settings';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** The colours a person gave to the built-in calendars. */
export function calendarColors(calendars: readonly AgendaCalendar[]): Record<string, string> {
  return Object.fromEntries(
    DEFAULT_AGENDA_CALENDARS.flatMap(({ id, color }) => {
      const chosen = calendars.find((calendar) => calendar.id === id)?.color;
      return chosen && chosen !== color && HEX_COLOR.test(chosen) ? [[id, chosen]] : [];
    }),
  );
}

/** Where the agenda settings lived before they followed the account. */
function agendaBrowserSettings(): BrowserSettings<AgendaUserSettings> {
  const data = inject(PlanoDataStore);
  return {
    read() {
      const { settings, filters, calendars } = data.data().agenda;
      const changed = changedSettings(
        { ...DEFAULT_AGENDA_USER_SETTINGS, ...settings, ...filters, calendarColors: calendarColors(calendars) },
        DEFAULT_AGENDA_USER_SETTINGS,
      );
      return Object.keys(changed).length ? changed : null;
    },
    forget() {
      data.update((current) => ({
        ...current,
        agenda: {
          ...current.agenda,
          settings: DEFAULT_AGENDA_SETTINGS,
          filters: DEFAULT_AGENDA_FILTERS,
          calendars: DEFAULT_AGENDA_CALENDARS,
        },
      }));
    },
  };
}

/** The agenda's settings, filters, calendar colours and recent events, on every device. */
export const AgendaSettingsStore = signalStore(
  { providedIn: 'root' },
  withAccountSettings({
    path: 'settings/agenda',
    defaults: DEFAULT_AGENDA_USER_SETTINGS,
    browser: agendaBrowserSettings,
  }),
);
