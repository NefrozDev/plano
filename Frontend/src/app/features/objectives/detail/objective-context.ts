import { Injectable, computed, inject, signal } from '@angular/core';
import { ObjectivesStore } from '../objectives.store';

/**
 * Provided by the detail layout. Tab components rendered in its <router-outlet>
 * inherit it through the element injector, so they never re-read route params.
 */
@Injectable()
export class ObjectiveContext {
  private readonly store = inject(ObjectivesStore);

  readonly id = signal('');
  /** The open objective, once the store holds this one. */
  readonly objective = computed(() => {
    const detail = this.store.detail();
    return detail?.id === this.id() ? detail : undefined;
  });
}
