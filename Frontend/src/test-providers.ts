import { importProvidersFrom } from '@angular/core';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { LOCALES } from '@plano/common';
import fr from './i18n/fr.json';

/**
 * Added to every TestBed (angular.json `providersFile`): specs render the
 * French source texts synchronously, so their assertions read like the app.
 */
export default [
  importProvidersFrom(
    TranslocoTestingModule.forRoot({
      langs: { fr },
      translocoConfig: { availableLangs: [...LOCALES], defaultLang: 'fr' },
      preloadLangs: true,
    }),
  ),
];
