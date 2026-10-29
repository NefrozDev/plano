import { ChangeDetectionStrategy, Component, DOCUMENT, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BottomNavComponent } from '../../../shared/ui/bottom-nav.component';
import type { Objective } from '@plano/common';
import { FriendNotificationsService } from '../../../core/friends/friend-notifications.service';
import { formatDate } from '../../../core/time/dates';
import { objectiveProgress, objectiveTint, progressLabel } from '../objective.utils';
import { ObjectiveTab, ObjectivesStore } from '../objectives.store';
import { ObjectiveCardComponent, ObjectiveCardView } from '../ui/objective-card.component';

@Component({
  selector: 'app-objectives-overview',
  imports: [RouterLink, ObjectiveCardComponent, BottomNavComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './objectives-overview.component.html',
  styleUrl: './objectives-overview.component.scss',
  host: {
    '(pointermove)': 'moveDrag($event)',
    '(pointerup)': 'endDrag()',
    '(pointercancel)': 'endDrag()',
  },
})
export class ObjectivesOverviewComponent {
  /** Friend news, shown on the bell that leads to the friends list. */
  readonly notifications = inject(FriendNotificationsService);
  readonly store = inject(ObjectivesStore);
  private readonly document = inject(DOCUMENT);
  /** Grips show only in the custom order, the one dragging changes. */
  readonly reorderable = computed(() => this.store.filters().sort === 'manual');
  readonly draggedObjective = signal<string | null>(null);

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

  /** Same behaviour as the Lists header: the choice is saved as the default view. */
  toggleView(): void {
    this.store.updateSettings({ defaultView: this.gridView() ? 'list' : 'grid' });
  }

  startDrag(id: string, event: PointerEvent): void {
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.draggedObjective.set(id);
  }

  /** Moves the dragged objective onto the card under the pointer; the store saves at once. */
  moveDrag(event: PointerEvent): void {
    const sourceId = this.draggedObjective();
    if (!sourceId) return;
    event.preventDefault();
    const targetId = this.document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('.objective-item')?.dataset['objectiveId'];
    if (targetId && targetId !== sourceId) this.store.moveObjective(sourceId, targetId);
  }

  endDrag(): void {
    this.draggedObjective.set(null);
  }

  /** Keyboard alternative to dragging: arrows move the objective past its visible neighbour. */
  moveWithKeyboard(id: string, event: KeyboardEvent): void {
    const step = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const visible = [...this.inProgress(), ...this.visibleCompleted()];
    const target = visible[visible.findIndex(({ objective }) => objective.id === id) + step];
    if (target) this.store.moveObjective(id, target.objective.id);
  }

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
