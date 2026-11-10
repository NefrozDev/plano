import { importProvidersFrom, inject, provideEnvironmentInitializer } from '@angular/core';
import { TranslocoService, TranslocoTestingModule } from '@jsverse/transloco';
import { LOCALES } from '@plano/common';
import { setInterfaceLocale } from './app/core/i18n/translate';
import { EVENT_SOURCE_FACTORY } from './app/core/live/live-updates.service';
import { FakeEventSource } from './app/testing/fake-event-source';
import fr from './i18n/fr.json';

/**
 * Added to every TestBed (angular.json `providersFile`): specs render the
 * French source texts synchronously, so their assertions read like the app,
 * and never open a real live-updates stream. Specs share one browser, so each
 * TestBed starts in French again and readies `t()` for code outside components.
 */
export default [
  {
    provide: EVENT_SOURCE_FACTORY,
    useValue: (url: string) => new FakeEventSource(url) as unknown as EventSource,
  },
  importProvidersFrom(
    TranslocoTestingModule.forRoot({
      langs: { fr },
      translocoConfig: { availableLangs: [...LOCALES], defaultLang: 'fr' },
      preloadLangs: true,
    }),
  ),
  provideEnvironmentInitializer(() => {
    inject(TranslocoService);
    setInterfaceLocale('fr');
  }),
];
