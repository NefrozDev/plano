import { InjectionToken } from '@angular/core';

/**
 * The Synapse account page, where the name, username, e-mail, password and
 * deletion of the account are managed for every app. The local identity
 * service runs on :4300 during development.
 */
export const SYNAPSE_ACCOUNT_URL = new InjectionToken<string>('SYNAPSE_ACCOUNT_URL', {
  providedIn: 'root',
  factory: () =>
    window.location.hostname === 'localhost'
      ? 'http://localhost:4300/account'
      : 'https://auth.synapseengineering.dev/account',
});
