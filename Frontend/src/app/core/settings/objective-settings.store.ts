import { inject } from '@angular/core';
import { signalStore } from '@ngrx/signals';
import {
  DEFAULT_OBJECTIVE_SETTINGS,
  DEFAULT_OBJECTIVE_USER_SETTINGS,
  type ObjectiveUserSettings,
} from '@plano/common';
import { PlanoDataStore } from '../data/plano-data.store';
import {
  changedSettings,
  withAccountSettings,
  type BrowserSettings,
} from './with-account-settings';

/** Where the objectives settings lived before they followed the account. */
function objectiveBrowserSettings(): BrowserSettings<ObjectiveUserSettings> {
  const data = inject(PlanoDataStore);
  return {
    read() {
      const changed = changedSettings(
        { ...DEFAULT_OBJECTIVE_USER_SETTINGS, ...data.data().objectives.settings },
        DEFAULT_OBJECTIVE_USER_SETTINGS,
      );
      return Object.keys(changed).length ? changed : null;
    },
    forget() {
      data.update((current) => ({
        ...current,
        objectives: { ...current.objectives, settings: DEFAULT_OBJECTIVE_SETTINGS },
      }));
    },
  };
}

/** The objectives screens' display settings and recent objectives, on every device. */
export const ObjectiveSettingsStore = signalStore(
  { providedIn: 'root' },
  withAccountSettings({
    path: 'settings/objectives',
    defaults: DEFAULT_OBJECTIVE_USER_SETTINGS,
    browser: objectiveBrowserSettings,
  }),
);
