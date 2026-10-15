import { InjectionToken } from '@angular/core';

/** Root of the versioned REST API; the dev server proxies it to NestJS. */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => '/api/v1',
});
