import { ChangeDetectionStrategy, Component, DOCUMENT, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { CountPipe } from '../../../core/i18n/translate';
import { BottomNavComponent } from '../../../shared/ui/bottom-nav.component';
import { ToastComponent } from '../../../shared/ui/toast.component';
import type { ObjectiveSummary } from '@plano/common';
import { dueCaption, objectiveTint, progressText, sharingLabel, timelapseView } from '../objective.utils';
import { ObjectiveTab, ObjectivesStore } from '../objectives.store';
import { DragReorder } from '../ui/drag-reorder';
import type { ObjectiveCardView } from '../ui/objective-card.component';
import { ObjectiveSwipeCardComponent } from '../ui/objective-swipe-card.component';

@Component({
  selector: 'app-objectives-overview',
  imports: [TranslocoPipe, CountPipe, RouterLink, ObjectiveSwipeCardComponent, BottomNavComponent, ToastComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './objectives-overview.component.html',
  styleUrl: './objectives-overview.component.scss',
  host: {
    '(pointermove)': 'drag.over($event)',
    '(pointerup)': 'drag.end()',
    '(pointercancel)': 'drag.end()',
  },
})
export class ObjectivesOverviewComponent {
  readonly store = inject(ObjectivesStore);
  /** Grips show only in the custom order, the one dragging changes. */
  readonly reorderable = computed(() => this.store.filters().sort === 'manual');
  readonly drag = new DragReorder(
    inject(DOCUMENT),
    (element) => element?.closest<HTMLElement>('.objective-item')?.dataset['objectiveId'],
    (id, targetId) => this.store.moveObjective(id, targetId),
    () => void this.store.saveOrder(),
  );

  /** Labels are translation keys. */
  readonly tabs: readonly { label: string; value: ObjectiveTab }[] = [
    { label: 'objectives.tabs.all', value: 'all' },
    { label: 'objectives.tabs.mine', value: 'mine' },
    { label: 'objectives.tabs.shared', value: 'shared' },
    { label: 'objectives.tabs.archived', value: 'archived' },
  ];
  readonly activeTab = signal<ObjectiveTab>('all');
  /** Why a card did not slide; empty when there is nothing to say. */
  readonly notice = signal('');
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
  private readonly visibleIds = computed(() =>
    [...this.inProgress(), ...this.visibleCompleted()].map(({ objective }) => objective.id),
  );

  constructor() {
    void this.store.load();
  }

  /** Same behaviour as the Lists header: the choice is saved as the default view. */
  toggleView(): void {
    this.store.updateSettings({ defaultView: this.gridView() ? 'list' : 'grid' });
  }

  moveWithKeyboard(id: string, event: KeyboardEvent): void {
    this.drag.keydown(id, event, this.visibleIds());
  }

  selectTab(tab: ObjectiveTab): void {
    this.activeTab.set(tab);
    this.showAllCompleted.set(false);
  }

  private toCard(objective: ObjectiveSummary): ObjectiveCardView {
    const { showPercentage, categoryColors } = this.store.settings();
    return {
      objective,
      progressText: progressText(objective, showPercentage),
      caption: dueCaption(objective),
      tint: objectiveTint(objective.category, categoryColors),
      timelapse: timelapseView(objective, this.store.today()),
      sharing: sharingLabel(objective),
    };
  }
}
