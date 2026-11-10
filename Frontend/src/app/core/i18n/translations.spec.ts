import { API_ERROR_CODES, LOCALES, type Locale } from '@plano/common';
import de from '../../../i18n/de.json';
import en from '../../../i18n/en.json';
import es from '../../../i18n/es.json';
import fr from '../../../i18n/fr.json';
import italian from '../../../i18n/it.json';
import nl from '../../../i18n/nl.json';

type Texts = { [key: string]: string | Texts };

const FILES: Readonly<Record<Locale, Texts>> = { fr, en, nl, es, de, it: italian };

/** Every text as `path.to.key` → text. */
function flatten(texts: Texts, prefix = ''): Map<string, string> {
  const entries = new Map<string, string>();
  for (const [key, value] of Object.entries(texts)) {
    if (typeof value === 'string') entries.set(prefix + key, value);
    else for (const [path, text] of flatten(value, `${prefix}${key}.`)) entries.set(path, text);
  }
  return entries;
}

const placeholders = (text: string): string[] => [...text.matchAll(/{{\s*(\w+)\s*}}/g)].map(([, name]) => name).sort();

describe('translation files', () => {
  const french = flatten(fr);

  it.each(LOCALES.filter((locale) => locale !== 'fr'))('%s has exactly the French keys, none empty', (locale) => {
    const texts = flatten(FILES[locale]);

    expect([...texts.keys()].sort()).toEqual([...french.keys()].sort());
    expect([...texts].filter(([, text]) => !text.trim()).map(([key]) => key)).toEqual([]);
  });

  it.each(LOCALES.filter((locale) => locale !== 'fr'))('%s keeps the placeholders of each French text', (locale) => {
    const texts = flatten(FILES[locale]);
    const differing = [...french].filter(([key, text]) => placeholders(text).join() !== placeholders(texts.get(key) ?? '').join());

    expect(differing.map(([key]) => key)).toEqual([]);
  });

  it('gives every counted text a plural form next to its singular', () => {
    const singulars = [...french.keys()].filter((key) => key.endsWith('.one'));

    expect(singulars.length).toBeGreaterThan(0);
    expect(singulars.filter((key) => !french.has(key.replace(/\.one$/, '.other')))).toEqual([]);
  });

  it('says what every API error code means', () => {
    expect(API_ERROR_CODES.filter((code) => !french.has(`apiErrors.${code}`))).toEqual([]);
  });
});
