import type { Page } from '@playwright/test';

/**
 * Applies the text spacing a reader may impose (WCAG 1.4.12: line height,
 * letter, word and paragraph spacing) and lists the elements that then cut
 * their text, each with what sticks out of it, so a failure names what to fix.
 */
export async function clippedWithTextSpacing(page: Page): Promise<string[]> {
  await page.addStyleTag({
    content: `* { line-height: 1.5 !important; letter-spacing: 0.12em !important;
      word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }`,
  });
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((element) => {
        const style = getComputedStyle(element);
        // Each axis on its own: a row that scrolls sideways loses nothing, even if it clips height.
        const clips = (o: string) => o === 'hidden' || o === 'clip';
        // Visually hidden text and names cut with an ellipsis on purpose are not clipped text.
        const meant =
          // Collapsed parts, hidden from assistive tech until opened, are not lost text either.
          !!element.closest('[aria-hidden="true"], [inert], [hidden]') ||
          element.clientWidth <= 1 ||
          style.clip === 'rect(0px, 0px, 0px, 0px)' ||
          style.textOverflow === 'ellipsis';
        return (
          !meant &&
          (element.textContent ?? '').trim() !== '' &&
          ((clips(style.overflowY) && element.scrollHeight > element.clientHeight + 1) ||
            (clips(style.overflowX) && element.scrollWidth > element.clientWidth + 1))
        );
      })
      .map((element) => {
        const box = element.getBoundingClientRect();
        const out = [...element.querySelectorAll<HTMLElement>('*')]
          .filter((child) => {
            const inner = child.getBoundingClientRect();
            return inner.width > 0 && (inner.right > box.right + 1 || inner.bottom > box.bottom + 1);
          })
          .slice(0, 3)
          .map((child) => `${child.tagName.toLowerCase()}.${child.getAttribute('class')}`);
        return `${element.getAttribute('class')}: ${(element.textContent ?? '').trim().slice(0, 40)} (${out.join(', ')})`;
      }),
  );
}
