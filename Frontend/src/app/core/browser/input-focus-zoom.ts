import { DOCUMENT, EnvironmentProviders, inject, provideAppInitializer } from '@angular/core';

type DeviceInfo = Pick<Navigator, 'userAgent' | 'maxTouchPoints'>;

/**
 * iOS Safari zooms in on any focused field whose text is under 16px and does
 * not zoom back out. A maximum scale stops that, while iOS still lets people
 * pinch-zoom. Other browsers would block pinch-zoom with it, and they do not
 * zoom on focus, so they keep the viewport untouched.
 */
export function preventInputFocusZoom(viewport: HTMLMetaElement | null, device: DeviceInfo): void {
  if (!viewport || !isIos(device) || viewport.content.includes('maximum-scale')) return;
  viewport.content = `${viewport.content}, maximum-scale=1`;
}

// iPadOS reports itself as a Mac; only its touch points give it away.
function isIos({ userAgent, maxTouchPoints }: DeviceInfo): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

export function provideInputFocusZoomFix(): EnvironmentProviders {
  return provideAppInitializer(() => {
    const document = inject(DOCUMENT);
    const navigator = document.defaultView?.navigator;
    if (navigator) {
      preventInputFocusZoom(document.querySelector('meta[name="viewport"]'), navigator);
    }
  });
}
