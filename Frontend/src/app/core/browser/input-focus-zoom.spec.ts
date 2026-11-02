import { ApplicationInitStatus, DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { preventInputFocusZoom, provideInputFocusZoomFix } from './input-focus-zoom';

const BASE = 'width=device-width, initial-scale=1, viewport-fit=cover';
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const IPAD_AS_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36';

function viewport(content = BASE): HTMLMetaElement {
  const meta = document.createElement('meta');
  meta.name = 'viewport';
  meta.content = content;
  return meta;
}

describe('preventInputFocusZoom', () => {
  it('caps the scale on an iPhone', () => {
    const meta = viewport();

    preventInputFocusZoom(meta, { userAgent: IPHONE, maxTouchPoints: 5 });

    expect(meta.content).toEqual(`${BASE}, maximum-scale=1`);
  });

  it('caps the scale on an iPad, which reports itself as a Mac with touch', () => {
    const meta = viewport();

    preventInputFocusZoom(meta, { userAgent: IPAD_AS_MAC, maxTouchPoints: 5 });

    expect(meta.content).toEqual(`${BASE}, maximum-scale=1`);
  });

  it('leaves a real Mac alone', () => {
    const meta = viewport();

    preventInputFocusZoom(meta, { userAgent: IPAD_AS_MAC, maxTouchPoints: 0 });

    expect(meta.content).toEqual(BASE);
  });

  it('leaves Android alone, where the cap would block pinch-zoom', () => {
    const meta = viewport();

    preventInputFocusZoom(meta, { userAgent: ANDROID, maxTouchPoints: 5 });

    expect(meta.content).toEqual(BASE);
  });

  it('does not add a second maximum scale', () => {
    const meta = viewport(`${BASE}, maximum-scale=2`);

    preventInputFocusZoom(meta, { userAgent: IPHONE, maxTouchPoints: 5 });

    expect(meta.content).toEqual(`${BASE}, maximum-scale=2`);
  });

  it('does nothing when the page has no viewport tag', () => {
    expect(() => preventInputFocusZoom(null, { userAgent: IPHONE, maxTouchPoints: 5 })).not.toThrow();
  });
});

describe('provideInputFocusZoomFix', () => {
  let meta: HTMLMetaElement;

  beforeEach(() => {
    meta = viewport();
    document.head.prepend(meta);
  });

  afterEach(() => {
    meta.remove();
    vi.restoreAllMocks();
  });

  async function bootstrap(): Promise<void> {
    TestBed.configureTestingModule({ providers: [provideInputFocusZoomFix()] });
    await TestBed.inject(ApplicationInitStatus).donePromise;
  }

  it('updates the page viewport at startup on iOS', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE);

    await bootstrap();

    expect(TestBed.inject(DOCUMENT).querySelector('meta[name="viewport"]')).toBe(meta);
    expect(meta.content).toEqual(`${BASE}, maximum-scale=1`);
  });

  it('leaves the page viewport alone elsewhere', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ANDROID);

    await bootstrap();

    expect(meta.content).toEqual(BASE);
  });
});
