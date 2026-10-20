import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { apiCredentialsInterceptor } from './core/http/api-credentials.interceptor';
import {
  BrowserStoragePlanoDataAdapter,
  PLANO_DATA_ADAPTER,
} from './core/data/plano-data.adapter';

export const appConfig: ApplicationConfig = {
  providers: [
    // Angular 21 defaults to zoneless; keep Zone.js until the app is migrated deliberately.
    provideZoneChangeDetection(),
    provideHttpClient(withInterceptors([apiCredentialsInterceptor])),
    provideRouter(routes),
    BrowserStoragePlanoDataAdapter,
    {
      provide: PLANO_DATA_ADAPTER,
      useExisting: BrowserStoragePlanoDataAdapter,
    },
  ],
};
