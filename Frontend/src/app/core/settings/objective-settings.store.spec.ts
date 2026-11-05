import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { DEFAULT_OBJECTIVE_USER_SETTINGS } from '@plano/common';
import { providePlanoTesting, settle } from '../../testing/plano-testing';
import { AuthService } from '../auth/auth.service';
import { PlanoDataStore } from '../data/plano-data.store';
import { ObjectiveSettingsStore } from './objective-settings.store';

const URL = '/api/v1/settings/objectives';

/** The loading and saving rules are shared with the agenda's (see agenda-settings.store.spec). */
describe('ObjectiveSettingsStore', () => {
  let http: HttpTestingController;
  const local = () => TestBed.inject(PlanoDataStore).data().objectives.settings;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [...providePlanoTesting([], { settingsApi: false }), { provide: AuthService, useValue: { user: signal({ id: 'ada' }) } }],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads from its own resource and saves there', async () => {
    const store = TestBed.inject(ObjectiveSettingsStore);
    TestBed.tick();
    http.expectOne({ method: 'GET', url: URL }).flush({ ...DEFAULT_OBJECTIVE_USER_SETTINGS, defaultView: 'grid' });
    await settle();
    expect(store.settings().defaultView).toBe('grid');
    // Nothing in this browser to move.
    http.expectNone({ method: 'PATCH', url: URL });

    store.update({ showArchived: true });
    const request = http.expectOne({ method: 'PATCH', url: URL });
    expect(request.request.body).toEqual({ showArchived: true });
    request.flush({ ...DEFAULT_OBJECTIVE_USER_SETTINGS, defaultView: 'grid', showArchived: true });
    expect(store.settings().showArchived).toBe(true);
  });

  it('moves what this browser changed, then forgets it', async () => {
    TestBed.inject(PlanoDataStore).update((data) => ({
      ...data,
      objectives: { ...data.objectives, settings: { ...data.objectives.settings, showPercentage: false } },
    }));
    TestBed.inject(ObjectiveSettingsStore);
    TestBed.tick();
    http.expectOne({ method: 'GET', url: URL }).flush(DEFAULT_OBJECTIVE_USER_SETTINGS);
    await settle();

    const request = http.expectOne({ method: 'PATCH', url: URL });
    expect(request.request.body).toEqual({ showPercentage: false });
    request.flush({ ...DEFAULT_OBJECTIVE_USER_SETTINGS, showPercentage: false });
    await settle();
    expect(local().showPercentage).toBe(true);
  });
});
