import { HttpTestingController } from '@angular/common/http/testing';
import { Provider, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ObjectiveDetail, ObjectiveSummary } from '@plano/common';
import { AuthService } from '../../core/auth/auth.service';
import { providePlanoTesting } from '../../testing/plano-testing';
import { ObjectiveContext } from './detail/objective-context';
import { ObjectivesStore } from './objectives.store';
import { ME } from './testing/objectives-fixtures';

export { TEST_TODAY } from '../../testing/plano-testing';

/** Objectives specs use the shared app test setup (frozen clock, fake HTTP backend). */
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

/** Signs in the person the fixtures call `ME`. */
export function provideSignedIn(): Provider {
  return { provide: AuthService, useValue: { user: signal({ id: ME }) } };
}

export function objectivesHttp(): HttpTestingController {
  return TestBed.inject(HttpTestingController);
}

/** Answers the GET /objectives a screen makes when it opens. */
export async function flushObjectives(objectives: ObjectiveSummary[]): Promise<void> {
  objectivesHttp().expectOne('/api/v1/objectives').flush(objectives);
  await settleObjectives();
}

/** Puts an objective in the store, as the detail layout does on opening it. */
export async function openObjective(detail: ObjectiveDetail): Promise<void> {
  const opening = TestBed.inject(ObjectivesStore).open(detail.id);
  objectivesHttp().expectOne(`/api/v1/objectives/${detail.id}`).flush(detail);
  await opening;
}

/** Waits one macrotask, so a flushed request has reached the store. */
export function settleObjectives(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}
