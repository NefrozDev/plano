import { expect, test, type Page } from '@playwright/test';

// The other suites block service workers so their /api mocks apply; this one needs the worker.
test.use({ serviceWorkers: 'allow' });

test.describe('installable app', () => {
  test('has nothing that stops Chrome from offering to install it', async ({ page, context }) => {
    await page.goto('/login?signIn=none');
    await page.evaluate(() => navigator.serviceWorker.ready);

    // Chrome's own installability check: manifest, icons, service worker, secure origin.
    const cdp = await context.newCDPSession(page);
    const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');

    expect(installabilityErrors).toEqual([]);
  });

  test('describes Plano as a standalone app with regular and maskable icons', async ({ page, request }) => {
    await page.goto('/login?signIn=none');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    const response = await request.get(`/${href}`);
    const manifest = (await response.json()) as { name: string; display: string; start_url: string; icons: { src: string; sizes: string; purpose: string }[] };

    expect(manifest).toMatchObject({ name: 'Plano', display: 'standalone', start_url: '/' });
    expect(manifest.icons.map(({ sizes, purpose }) => `${sizes} ${purpose}`)).toEqual([
      '192x192 any',
      '512x512 any',
      '192x192 maskable',
      '512x512 maskable',
    ]);
    for (const icon of manifest.icons) {
      const image = await request.get(`/${icon.src}`);
      expect(image.status(), icon.src).toBe(200);
      expect(image.headers()['content-type']).toBe('image/png');
    }
  });

  test('opens offline once the service worker has cached it', async ({ page, context }) => {
    await controlledPage(page);

    await context.setOffline(true);
    // A public page: a signed-in one would leave for the (offline) sign-in endpoint.
    const response = await page.goto('/terms');

    expect(response?.fromServiceWorker()).toBe(true);
    await expect(page.locator('app-root')).not.toBeEmpty();
  });

  test('leaves /api navigations to the server, as sign-in redirects need', async ({ page }) => {
    await controlledPage(page);

    // From the cache, this would be the app's index.html instead of the server's answer
    // (a 404 here, as the test server has no API).
    const response = await page.goto('/api/auth/login');

    expect(response?.status()).toBe(404);
    expect(await page.locator('app-root').count()).toBe(0);
  });
});

/** Opens the app and waits until its service worker controls the page. */
async function controlledPage(page: Page): Promise<void> {
  await page.goto('/login?signIn=none');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}
