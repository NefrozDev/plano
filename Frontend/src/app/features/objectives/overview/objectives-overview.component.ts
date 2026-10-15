import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Objective } from '@plano/common';
import {
  formatDate,
  objectiveProgress,
  objectiveTint,
  progressLabel,
} from '../objective.utils';
import { ObjectiveTab, ObjectivesStore } from '../objectives.store';
import { ObjectiveCardComponent, ObjectiveCardView } from '../ui/objective-card.component';

@Component({
  selector: 'app-objectives-overview',
  standalone: true,
  imports: [RouterLink, ObjectiveCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './objectives-overview.component.html',
  styleUrl: './objectives-overview.component.scss',
})
export class ObjectivesOverviewComponent {
  readonly store = inject(ObjectivesStore);

  readonly tabs: readonly { label: string; value: ObjectiveTab }[] = [
    { label: 'Tous', value: 'all' },
    { label: 'Mes objectifs', value: 'mine' },
    { label: 'Partagés', value: 'shared' },
    { label: 'Archivés', value: 'archived' },
  ];
  readonly activeTab = signal<ObjectiveTab>('all');
  readonly menuOpen = signal(false);
  readonly showAllCompleted = signal(false);
  readonly gridView = computed(() => this.store.settings().defaultView === 'grid');

  private readonly cards = computed(() =>
    this.store.query(this.activeTab()).map((objective) => this.toCard(objective)),
  );
  readonly inProgress = computed(() =>
    this.cards().filter(({ objective }) => objective.status !== 'completed'),
  );
  readonly completed = computed(() =>
    this.cards().filter(({ objective }) => objective.status === 'completed'),
  );
  readonly visibleCompleted = computed(() =>
    this.showAllCompleted() ? this.completed() : this.completed().slice(0, 1),
  );

  selectTab(tab: ObjectiveTab): void {
    this.activeTab.set(tab);
    this.showAllCompleted.set(false);
  }

  private toCard(objective: Objective): ObjectiveCardView {
    const { showPercentage, categoryColors } = this.store.settings();
    const progress = objectiveProgress(objective);
    let caption = objective.dueDate ? `Échéance : ${formatDate(objective.dueDate)}` : 'Sans échéance';
    if (objective.status === 'completed' && objective.completedOn) {
      caption = `Terminé le ${formatDate(objective.completedOn)}`;
    }
    return {
      objective,
      progress,
      progressText: showPercentage ? `${progress} %` : progressLabel(objective),
      caption,
      tint: objectiveTint(objective.category, categoryColors),
    };
  }
}
