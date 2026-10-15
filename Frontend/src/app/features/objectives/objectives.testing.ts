import { Provider } from '@angular/core';
import { providePlanoTesting } from '../../testing/plano-testing';
import { ObjectiveContext } from './detail/objective-context';

export { TEST_TODAY } from '../../testing/plano-testing';

/** Objectives specs use the shared app test setup (frozen clock, in-memory data). */
export const provideObjectivesTesting = providePlanoTesting;

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
