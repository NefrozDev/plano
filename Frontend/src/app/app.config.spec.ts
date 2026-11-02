import { NgZone } from '@angular/core';
import { createApplication } from '@angular/platform-browser';
import { appConfig } from './app.config';

describe('appConfig', () => {
  // TestBed enables Zone.js on its own, so only a real bootstrap proves the app config does.
  it('keeps Zone.js change detection, which Angular no longer enables by default', async () => {
    const app = await createApplication(appConfig);
    try {
      expect(app.injector.get(NgZone)).toBeInstanceOf(NgZone);
    } finally {
      app.destroy();
    }
  });

  it('stops iOS from zooming in on focused fields', async () => {
    const meta = document.createElement('meta');
    meta.name = 'viewport';
    meta.content = 'width=device-width, initial-scale=1';
    document.head.prepend(meta);
    const userAgent = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone)');

    const app = await createApplication(appConfig);
    try {
      expect(meta.content).toEqual('width=device-width, initial-scale=1, maximum-scale=1');
    } finally {
      app.destroy();
      meta.remove();
      userAgent.mockRestore();
    }
  });
});
