import { Pipe, PipeTransform, signal } from '@angular/core';
import { translate } from '@jsverse/transloco';
import type { Locale } from '@plano/common';

/** Values of a text's {{placeholders}}. */
export type TextParams = Readonly<Record<string, unknown>>;

const current = signal<Locale>('fr');

/**
 * The interface language as a signal. Everything below reads it, so a computed
 * or a template calling them is recomputed when the language changes.
 */
export const interfaceLocale = current.asReadonly();

/** Called by `LanguageService` once the language's texts are loaded. */
export function setInterfaceLocale(locale: Locale): void {
  current.set(locale);
}

/** The region used for dates and numbers of each language (Plano is Belgian). */
const FORMAT_LOCALES: Readonly<Record<Locale, string>> = {
  fr: 'fr-FR',
  en: 'en-GB',
  nl: 'nl-BE',
  es: 'es-ES',
  de: 'de-DE',
  it: 'it-IT',
};

export function formatLocale(): string {
  return FORMAT_LOCALES[current()];
}

/** A text in the interface language, for TypeScript code (templates use the `transloco` pipe). */
export function t(key: string, params?: TextParams): string {
  current();
  return translate(key, params);
}

/** "Ada, Bob et Cyd", "Ada, Bob and Cyd": names joined as the language does. */
export function formatList(items: readonly string[]): string {
  return new Intl.ListFormat(formatLocale(), { style: 'long', type: 'conjunction' }).format(items);
}

const pluralRules = new Map<Locale, Intl.PluralRules>();

/**
 * A counted text: `key.one` or `key.other` as the language's plural rules say
 * (French says "0 élément", English "0 items"); `{{count}}` is formatted for
 * the language. Forms other than `one` fall back to `other`.
 */
export function tCount(key: string, count: number, params?: TextParams): string {
  const locale = current();
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(FORMAT_LOCALES[locale]);
    pluralRules.set(locale, rules);
  }
  const form = rules.select(count) === 'one' ? 'one' : 'other';
  return t(`${key}.${form}`, { ...params, count: formatCount(count) });
}

function formatCount(count: number): string {
  return new Intl.NumberFormat(FORMAT_LOCALES[current()]).format(count);
}

/** `{{ 'lists.items' | count: total }}`: `tCount()` in a template. */
@Pipe({ name: 'count', pure: false })
export class CountPipe implements PipeTransform {
  transform(key: string, count: number, params?: TextParams): string {
    return tCount(key, count, params);
  }
}
