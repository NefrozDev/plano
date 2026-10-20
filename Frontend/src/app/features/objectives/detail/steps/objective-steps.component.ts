import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import type { ObjectiveStep } from '@plano/common';
import { formatDate } from '../../../../core/time/dates';
import { ObjectivesStore } from '../../objectives.store';
import { ObjectiveContext } from '../objective-context';

@Component({
  selector: 'app-objective-steps',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './objective-steps.component.html',
  styleUrl: './objective-steps.component.scss',
})
export class ObjectiveStepsComponent {
  private readonly store = inject(ObjectivesStore);

  readonly objective = inject(ObjectiveContext).objective;
  readonly adding = signal(false);
  private readonly newStepInput = viewChild<ElementRef<HTMLInputElement>>('newStep');
  readonly completedCount = computed(
    () => this.objective()?.steps.filter((step) => step.done).length ?? 0,
  );
  /** The first unfinished step is the one in progress; later ones are still to do. */
  private readonly currentStepId = computed(
    () => this.objective()?.steps.find((step) => !step.done)?.id ?? null,
  );

  constructor() {
    effect(() => this.newStepInput()?.nativeElement.focus());
  }

  caption(step: ObjectiveStep): string {
    if (step.done) return step.completedOn ? `Terminé le ${formatDate(step.completedOn)}` : 'Terminé';
    return step.id === this.currentStepId() ? 'En cours' : 'À faire';
  }

  toggle(stepId: string): void {
    const objective = this.objective();
    if (objective) this.store.toggleStep(objective.id, stepId);
  }

  remove(stepId: string): void {
    const objective = this.objective();
    if (objective) this.store.removeStep(objective.id, stepId);
  }

  add(label: string): void {
    // Enter/Escape remove the input, which can fire a trailing blur: ignore it.
    if (!this.adding()) return;
    const objective = this.objective();
    if (objective) this.store.addStep(objective.id, label);
    this.adding.set(false);
  }
}
