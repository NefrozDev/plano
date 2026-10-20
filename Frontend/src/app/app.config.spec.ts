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
});
