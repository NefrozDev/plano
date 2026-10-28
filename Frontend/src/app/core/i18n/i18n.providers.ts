import {
  EnvironmentProviders,
  Injectable,
  isDevMode,
  inject,
  provideAppInitializer,
} from '@angular/core';
import { Translation, TranslocoLoader, provideTransloco } from '@jsverse/transloco';
import { LOCALES } from '@plano/common';
import { DEFAULT_LOCALE, LanguageService } from './language.service';

/**
 * Each language file is its own lazy chunk with a hashed name: a deploy that
 * changes translations changes the URL, so browsers never keep stale ones.
 */
@Injectable({ providedIn: 'root' })
export class BundledTranslationLoader implements TranslocoLoader {
  async getTranslation(lang: string): Promise<Translation> {
    const file = (await import(`../../../i18n/${lang}.json`)) as { default: Translation };
    return file.default;
  }
}

export function provideI18n(): EnvironmentProviders[] {
  return [
    ...provideTransloco({
      config: {
        availableLangs: [...LOCALES],
        defaultLang: DEFAULT_LOCALE,
        fallbackLang: DEFAULT_LOCALE,
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
        // A key missing in one language shows its French text rather than the key.
        missingHandler: { useFallbackTranslation: true, logMissingKey: isDevMode() },
      },
      loader: BundledTranslationLoader,
    }),
    provideAppInitializer(() => inject(LanguageService).initialize()),
  ];
}
