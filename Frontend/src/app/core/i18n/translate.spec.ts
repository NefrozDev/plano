import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { formatDate } from '../time/dates';
import { CountPipe, formatLocale, interfaceLocale, setInterfaceLocale, t, tCount } from './translate';

@Component({
  imports: [CountPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p>{{ 'test.items' | count: total }}</p>`,
})
class CountHostComponent {
  total = 1;
}

describe('translate helpers', () => {
  let transloco: TranslocoService;

  beforeEach(() => {
    transloco = TestBed.inject(TranslocoService);
    transloco.setTranslation(
      { test: { hello: 'Bonjour {{name}}', items: { one: '{{count}} élément', other: '{{count}} éléments' } } },
      'fr',
      { merge: true },
    );
    transloco.setTranslation(
      { test: { hello: 'Hello {{name}}', items: { one: '{{count}} item', other: '{{count}} items' } } },
      'en',
      { merge: true },
    );
  });

  it('translates with parameters in the active language', () => {
    expect(t('test.hello', { name: 'Ada' })).toBe('Bonjour Ada');

    transloco.setActiveLang('en');
    setInterfaceLocale('en');

    expect(t('test.hello', { name: 'Ada' })).toBe('Hello Ada');
  });

  it('picks the singular as each language does: French for 0 and 1, English for 1 only', () => {
    expect(tCount('test.items', 0)).toBe('0 élément');
    expect(tCount('test.items', 1)).toBe('1 élément');
    expect(tCount('test.items', 2)).toBe('2 éléments');

    transloco.setActiveLang('en');
    setInterfaceLocale('en');

    expect(tCount('test.items', 0)).toBe('0 items');
    expect(tCount('test.items', 1)).toBe('1 item');
  });

  it('formats the count for the language and falls back to the plural for other forms', () => {
    // French says "1 million" with the "many" form, which has no text of its own.
    expect(tCount('test.items', 1_000_000)).toBe('1 000 000 éléments');

    transloco.setActiveLang('en');
    setInterfaceLocale('en');

    expect(tCount('test.items', 2300)).toBe('2,300 items');
  });

  it('gives dates and numbers the region of each language', () => {
    expect(formatLocale()).toBe('fr-FR');
    setInterfaceLocale('nl');
    expect(formatLocale()).toBe('nl-BE');
    setInterfaceLocale('en');
    expect(formatLocale()).toBe('en-GB');
    expect(interfaceLocale()).toBe('en');
  });

  it('recomputes a computed text when the language changes', () => {
    const date = computed(() => formatDate('2026-10-15'));
    expect(date()).toBe('15 oct. 2026');

    setInterfaceLocale('en');

    expect(date()).toBe('15 Oct 2026');
  });

  it('updates a counted text in a template on a language change', async () => {
    const fixture = TestBed.createComponent(CountHostComponent);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toBe('1 élément');

    transloco.setActiveLang('en');
    setInterfaceLocale('en');
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toBe('1 item');
  });
});
