import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { TitleStrategy, provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { provideInputFocusZoomFix } from './core/browser/input-focus-zoom';
import { apiCredentialsInterceptor } from './core/http/api-credentials.interceptor';
import { provideI18n } from './core/i18n/i18n.providers';
import { TranslatedTitleStrategy } from './core/i18n/translated-title.strategy';
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
    { provide: TitleStrategy, useClass: TranslatedTitleStrategy },
    provideI18n(),
    provideInputFocusZoomFix(),
    BrowserStoragePlanoDataAdapter,
    {
      provide: PLANO_DATA_ADAPTER,
      useExisting: BrowserStoragePlanoDataAdapter,
    },
  ],
};
