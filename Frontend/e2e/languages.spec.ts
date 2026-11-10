import { expect, test } from '@playwright/test';
import { openScreen, screens } from './support/screens';
import { clippedWithTextSpacing } from './support/text-spacing';

/** Each language besides French, with the browser locale that picks it before sign-in. */
const LANGUAGES = [
  { locale: 'en', browser: 'en-GB' },
  { locale: 'nl', browser: 'nl-BE' },
  { locale: 'es', browser: 'es-ES' },
  { locale: 'de', browser: 'de-DE' },
  { locale: 'it', browser: 'it-IT' },
] as const;

/** A translation key shown as such: a text the language file lacks (the identity domain is not one). */
const RAW_KEY =
  /\b(?!auth\.synapseengineering\.dev)(?:apiErrors|errors|titles|common|auth|dashboard|nav|settings|notifications|friends|participants|groups|terms|agenda|lists|objectives)\.[a-zA-Z_]+(?:\.[a-zA-Z_]+)*\b/;

// Screens brought to a state by clicking a button find it by its French name: French covers them.
const plainScreens = screens.filter((screen) => !screen.act);

// At phone width, where long words (German) are the likeliest to push the page sideways.
test.use({ viewport: { width: 320, height: 640 }, reducedMotion: 'reduce' });

for (const { locale, browser } of LANGUAGES) {
  test.describe(`in ${locale}, every screen is translated and reflows to 320px`, () => {
    test.use({ locale: browser });

    for (const screen of plainScreens) {
      test(screen.name, async ({ page }) => {
        await openScreen(page, { ...screen, mock: { ...screen.mock, locale } });

        // 3.1.1: screen readers speak the page in its language.
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        const shown = await page.evaluate(() => {
          const attributes = [...document.querySelectorAll('[aria-label], [placeholder], [title]')].flatMap((element) =>
            ['aria-label', 'placeholder', 'title'].map((name) => element.getAttribute(name) ?? ''),
          );
          return [document.title, document.body.innerText, ...attributes].join('\n');
        });
        expect(shown.match(RAW_KEY)?.[0] ?? null, 'a text without a translation').toBeNull();

        const widths = await page.evaluate(() => ({
          content: document.documentElement.scrollWidth,
          viewport: document.documentElement.clientWidth,
        }));
        expect(widths.content).toBeLessThanOrEqual(widths.viewport);
      });
    }
  });
}

// German has the longest words: its texts must still fit with WCAG text spacing (1.4.12).
test.describe('in de, every screen keeps its text whole with text spacing', () => {
  test.use({ locale: 'de-DE' });

  for (const screen of plainScreens) {
    test(screen.name, async ({ page }) => {
      await openScreen(page, { ...screen, mock: { ...screen.mock, locale: 'de' } });

      expect(await clippedWithTextSpacing(page)).toEqual([]);
    });
  }
});
