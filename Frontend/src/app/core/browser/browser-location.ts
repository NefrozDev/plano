import { InjectionToken } from '@angular/core';

/**
 * Full-page navigations, to the API's sign-in and to the identity service.
 * Specs provide a fake to see where the app would have gone.
 */
export interface BrowserLocation {
  assign(url: string): void;
}

export const BROWSER_LOCATION = new InjectionToken<BrowserLocation>('BROWSER_LOCATION', {
  providedIn: 'root',
  factory: () => ({ assign: (url: string) => window.location.assign(url) }),
});
