import { NavigationEnd, NavigationStart, type Event as RouterEvent, type Router } from '@angular/router';
import type { SwUpdate, UnrecoverableStateEvent, VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { watchForUpdates } from './app-updates';

const READY: VersionEvent = {
  type: 'VERSION_READY',
  currentVersion: { hash: 'old' },
  latestVersion: { hash: 'new' },
};

describe('watchForUpdates', () => {
  let versionUpdates: Subject<VersionEvent>;
  let unrecoverable: Subject<UnrecoverableStateEvent>;
  let routerEvents: Subject<RouterEvent>;
  let checkForUpdate: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
  let reload: ReturnType<typeof vi.fn<() => void>>;
  let document: Document & { visibilityState: DocumentVisibilityState };

  function watch(isEnabled = true): void {
    const updates = { isEnabled, versionUpdates, unrecoverable, checkForUpdate } as unknown as SwUpdate;
    watchForUpdates(updates, { events: routerEvents } as unknown as Router, document);
  }

  const navigated = () => routerEvents.next(new NavigationEnd(1, '/lists', '/lists'));
  const shown = (state: DocumentVisibilityState) => {
    document.visibilityState = state;
    document.dispatchEvent(new Event('visibilitychange'));
  };

  beforeEach(() => {
    versionUpdates = new Subject();
    unrecoverable = new Subject();
    routerEvents = new Subject();
    checkForUpdate = vi.fn(() => Promise.resolve(false));
    reload = vi.fn();
    // A bare event target stands in for the document: jsdom's location.reload cannot be spied on.
    document = Object.assign(new EventTarget(), {
      location: { reload },
      visibilityState: 'visible' as DocumentVisibilityState,
    }) as unknown as Document & { visibilityState: DocumentVisibilityState };
  });

  it('reloads at the next finished navigation once a new version is ready, not before', () => {
    watch();
    navigated();
    expect(reload).not.toHaveBeenCalled();

    versionUpdates.next(READY);
    expect(reload).not.toHaveBeenCalled();

    routerEvents.next(new NavigationStart(2, '/agenda'));
    expect(reload).not.toHaveBeenCalled();

    navigated();
    expect(reload).toHaveBeenCalledTimes(1);

    navigated();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('ignores version events other than a ready version', () => {
    watch();
    versionUpdates.next({ type: 'VERSION_DETECTED', version: { hash: 'new' } });
    versionUpdates.next({ type: 'NO_NEW_VERSION_DETECTED', version: { hash: 'old' } });
    navigated();

    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads at once when the cached app can no longer run', () => {
    watch();
    unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'evicted' });

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('checks for a new version each time the app comes back on screen', () => {
    watch();
    shown('hidden');
    expect(checkForUpdate).not.toHaveBeenCalled();

    shown('visible');
    shown('visible');
    expect(checkForUpdate).toHaveBeenCalledTimes(2);
  });

  it('swallows a failed check, which only means the network is down', async () => {
    checkForUpdate.mockRejectedValue(new Error('offline'));
    watch();

    shown('visible');
    await Promise.resolve();

    expect(checkForUpdate).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it('does nothing when the service worker is off (development, unsupported browser)', () => {
    watch(false);
    versionUpdates.next(READY);
    navigated();
    unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'evicted' });
    shown('visible');

    expect(reload).not.toHaveBeenCalled();
    expect(checkForUpdate).not.toHaveBeenCalled();
  });
});
