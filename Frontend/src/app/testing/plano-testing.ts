import { EnvironmentProviders, Provider } from '@angular/core';
import { Routes, provideRouter } from '@angular/router';
import { MemoryPlanoDataAdapter, PLANO_DATA_ADAPTER } from '../core/data/plano-data.adapter';
import { APP_CLOCK } from '../core/time/dates';

/** "Today" for every spec: Thursday 15 October 2026, 10:30, matching the seed data. */
export const TEST_TODAY = new Date(2026, 9, 15, 10, 30);

/** Fresh in-memory seed data, a frozen clock and a router: specs never touch localStorage. */
export function providePlanoTesting(routes: Routes = []): (Provider | EnvironmentProviders)[] {
  return [
    provideRouter(routes),
    { provide: APP_CLOCK, useValue: () => new Date(TEST_TODAY) },
    { provide: PLANO_DATA_ADAPTER, useFactory: () => new MemoryPlanoDataAdapter() },
  ];
}
