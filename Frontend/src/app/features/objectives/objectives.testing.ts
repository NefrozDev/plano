import { EnvironmentProviders, Provider } from '@angular/core';
import { Routes, provideRouter } from '@angular/router';
import { MemoryPlanoDataAdapter, PLANO_DATA_ADAPTER } from '../../core/data/plano-data.adapter';
import { ObjectiveContext } from './detail/objective-context';
import { OBJECTIVES_CLOCK } from './objective.utils';

/** "Today" for every objectives spec: Thursday 15 October 2026, matching the seed data. */
export const TEST_TODAY = new Date(2026, 9, 15, 10, 30);

/** Fresh in-memory seed data, a frozen clock and a router: specs never touch localStorage. */
export function provideObjectivesTesting(routes: Routes = []): (Provider | EnvironmentProviders)[] {
  return [
    provideRouter(routes),
    { provide: OBJECTIVES_CLOCK, useValue: () => new Date(TEST_TODAY) },
    { provide: PLANO_DATA_ADAPTER, useFactory: () => new MemoryPlanoDataAdapter() },
  ];
}

/** Stands in for the detail layout, which normally provides the context to its tabs. */
export function provideObjectiveContext(id: string): Provider {
  return {
    provide: ObjectiveContext,
    useFactory: () => {
      const context = new ObjectiveContext();
      context.id.set(id);
      return context;
    },
  };
}
