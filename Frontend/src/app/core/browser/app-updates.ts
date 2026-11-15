import { DOCUMENT, EnvironmentProviders, inject, isDevMode, makeEnvironmentProviders, provideAppInitializer } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { provideServiceWorker, SwUpdate } from '@angular/service-worker';
import { filter, first, fromEvent, switchMap } from 'rxjs';

/**
 * Makes Plano installable and keeps installed copies current. The service
 * worker serves the cached app; once it has downloaded a newer deploy, the app
 * reloads at the next route change, so nobody loses what they were typing.
 */
export function provideAppUpdates(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      // Registering after the first screen is up keeps the worker's downloads off the first load.
      registrationStrategy: 'registerWhenStable:30000',
    }),
    provideAppInitializer(() => watchForUpdates(inject(SwUpdate), inject(Router), inject(DOCUMENT))),
  ]);
}

export function watchForUpdates(updates: SwUpdate, router: Router, document: Document): void {
  if (!updates.isEnabled) return;
  const reload = () => document.location.reload();

  updates.versionUpdates
    .pipe(
      filter((event) => event.type === 'VERSION_READY'),
      first(),
      switchMap(() => router.events.pipe(filter((event) => event instanceof NavigationEnd), first())),
    )
    .subscribe(reload);

  // The cached app cannot run any more (its files were evicted): only a reload recovers.
  updates.unrecoverable.subscribe(reload);

  // An installed app stays open for days: check again whenever it comes back to the screen.
  fromEvent(document, 'visibilitychange')
    .pipe(filter(() => document.visibilityState === 'visible'))
    .subscribe(() => void updates.checkForUpdate().catch(() => undefined));
}
