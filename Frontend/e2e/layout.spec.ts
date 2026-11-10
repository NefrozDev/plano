import { expect, test } from '@playwright/test';
import { openScreen, screens } from './support/screens';
import { clippedWithTextSpacing } from './support/text-spacing';

// 320 CSS pixels: a 1280px window zoomed to 400%, what WCAG 1.4.10 (Reflow) asks to support.
test.use({ viewport: { width: 320, height: 640 }, reducedMotion: 'reduce' });

test.describe('every screen reflows to 320px without scrolling sideways (1.4.10)', () => {
  for (const screen of screens) {
    test(screen.name, async ({ page }) => {
      await openScreen(page, screen);

      const widths = await page.evaluate(() => ({
        content: document.documentElement.scrollWidth,
        viewport: document.documentElement.clientWidth,
      }));
      expect(widths.content).toBeLessThanOrEqual(widths.viewport);
    });
  }
});

test.describe('every screen keeps its text whole with WCAG text spacing (1.4.12)', () => {
  for (const screen of screens) {
    test(screen.name, async ({ page }) => {
      await openScreen(page, screen);
      const clipped = await clippedWithTextSpacing(page);
      expect(clipped).toEqual([]);
      const widths = await page.evaluate(() => ({
        content: document.documentElement.scrollWidth,
        viewport: document.documentElement.clientWidth,
      }));
      expect(widths.content).toBeLessThanOrEqual(widths.viewport);
    });
  }
});
