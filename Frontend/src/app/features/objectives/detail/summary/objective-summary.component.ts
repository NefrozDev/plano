import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { toPerson } from '../../../../core/people/people';
import { AvatarStackComponent } from '../../../../shared/ui/avatar-stack.component';
import type {
  DueReminder,
  ObjectiveDetail,
  ObjectiveReminder,
  ObjectiveSummary,
} from '@plano/common';
import { daysBetween, formatShortDate, toIsoDate } from '../../../../core/time/dates';
import {
  DUE_REMINDER_LABELS,
  WEEKDAY_LABELS,
  dueCaption,
  formatNumber,
  longestStreak,
  objectiveReminderLabel,
  objectiveTint,
  progressText,
  sharingLabel,
  timelapseView,
} from '../../objective.utils';
import { ObjectivesStore } from '../../objectives.store';
import { DragReorder } from '../../ui/drag-reorder';
import { ObjectiveCardComponent, ObjectiveCardView } from '../../ui/objective-card.component';
import { ObjectiveIconComponent } from '../../ui/objective-icon.component';
import { TimelapseBarComponent } from '../../ui/timelapse-bar.component';
import { ObjectiveContext } from '../objective-context';

type EditableRow = 'description' | 'plan' | 'reminder';

interface StatTile {
  value: string;
  label: string;
}

@Component({
  selector: 'app-objective-summary',
  imports: [RouterLink, AvatarStackComponent, ObjectiveCardComponent, ObjectiveIconComponent, TimelapseBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './objective-summary.component.html',
  styleUrl: './objective-summary.component.scss',
  host: {
    '(pointermove)': 'drag.over($event)',
    '(pointerup)': 'drag.end()',
    '(pointercancel)': 'drag.end()',
  },
})
export class ObjectiveSummaryComponent {
  private readonly store = inject(ObjectivesStore);

  /** Read by the detail layout to hide its own (duplicate) title. */
  readonly hidesHeaderTitle = true;
  readonly objective = inject(ObjectiveContext).objective;
  readonly editingTitle = signal(false);
  private readonly titleInput = viewChild<ElementRef<HTMLInputElement>>('titleInput');
  readonly openRow = signal<EditableRow | null>(null);
  readonly weekdays = WEEKDAY_LABELS;
  readonly dueReminders = Object.entries(DUE_REMINDER_LABELS) as [DueReminder, string][];
  readonly drag = new DragReorder(
    inject(DOCUMENT),
    (element) => element?.closest<HTMLElement>('.child-item')?.dataset['childId'],
    (id, targetId) => this.store.moveChild(id, targetId),
    () => void this.store.saveChildOrder(),
  );
  /** The sub-objective being ticked, so a double tap sends one request. */
  readonly toggling = signal('');

  readonly isOwner = computed(() => this.objective()?.role === 'owner');
  readonly canContribute = computed(() => {
    const role = this.objective()?.role;
    return role === 'owner' || role === 'contributor';
  });
  private readonly childIds = computed(() => this.objective()?.children.map(({ id }) => id) ?? []);

  readonly view = computed(() => {
    const objective = this.objective();
    if (!objective) return null;
    const { showPercentage, categoryColors } = this.store.settings();
    return {
      progressText: progressText(objective, showPercentage),
      tint: objectiveTint(objective.category, categoryColors),
      due: dueCaption(objective),
      timelapse: timelapseView(objective, this.store.today()),
      tiles: [...this.trackingTiles(objective), this.deadlineTile(objective)],
      reminder: objectiveReminderLabel(objective.reminder),
      dueReminder: DUE_REMINDER_LABELS[objective.dueReminder],
      children: objective.children.map((child) => this.toCard(child)),
      people: objective.people.map(toPerson),
      contributions: this.contributions(objective),
    };
  });

  constructor() {
    effect(() => this.titleInput()?.nativeElement.focus());
  }

  toggleRow(row: EditableRow): void {
    this.openRow.update((open) => (open === row ? null : row));
  }

  saveTitle(value: string): void {
    // Enter/Escape remove the input, which can fire a trailing blur: ignore it.
    if (!this.editingTitle()) return;
    const objective = this.objective();
    const title = value.trim();
    if (objective && title && title !== objective.title) void this.store.update(objective.id, { title });
    this.editingTitle.set(false);
  }

  updateText(field: 'description' | 'plan', value: string): void {
    const objective = this.objective();
    if (objective) void this.store.update(objective.id, { [field]: value.trim() });
  }

  updateReminder(changes: Partial<ObjectiveReminder>): void {
    const objective = this.objective();
    if (objective) {
      void this.store.updatePreferences(objective.id, { reminder: { ...objective.reminder, ...changes } });
    }
  }

  updateDueReminder(dueReminder: DueReminder): void {
    const objective = this.objective();
    if (objective) void this.store.updatePreferences(objective.id, { dueReminder });
  }

  setProgress(percent: number): void {
    const objective = this.objective();
    if (objective) void this.store.setProgress(objective.id, percent);
  }

  toggleCompleted(): void {
    const objective = this.objective();
    if (objective) void this.store.setCompleted(objective.id, objective.status !== 'completed');
  }

  async toggleChild(child: ObjectiveSummary): Promise<void> {
    if (this.toggling()) return;
    this.toggling.set(child.id);
    await this.store.setChildCompleted(child.id, child.status !== 'completed');
    this.toggling.set('');
  }

  assign(userId: string): void {
    const objective = this.objective();
    if (objective) void this.store.update(objective.id, { assignedToUserId: userId || null });
  }

  moveChildWithKeyboard(id: string, event: KeyboardEvent): void {
    this.drag.keydown(id, event, this.childIds());
  }

  private toCard(child: ObjectiveSummary): ObjectiveCardView {
    const { showPercentage, categoryColors } = this.store.settings();
    return {
      objective: child,
      progressText: progressText(child, showPercentage),
      caption: dueCaption(child),
      tint: objectiveTint(child.category, categoryColors),
      timelapse: timelapseView(child, this.store.today()),
      sharing: sharingLabel(child),
    };
  }

  /** Each person's share, as soon as there is more than one person to compare. */
  private contributions(objective: ObjectiveDetail): { name: string; value: string; share: number }[] {
    if (objective.contributions.length < 2) return [];
    const unit = this.contributionUnit(objective);
    const top = Math.max(1, ...objective.contributions.map(({ value }) => value));
    return objective.contributions.map(({ person, value }) => ({
      name: person.name,
      value: `${formatNumber(value)} ${unit}`,
      share: Math.round((value / top) * 100),
    }));
  }

  private contributionUnit(objective: ObjectiveDetail): string {
    if (objective.completion === 'metric') return objective.metric?.unit ?? '';
    return objective.completion === 'habit' ? 'j' : 'terminé(s)';
  }

  private trackingTiles(objective: ObjectiveDetail): StatTile[] {
    switch (objective.completion) {
      case 'metric': {
        const metric = objective.metric;
        const done = objective.sessions.filter((session) => session.status === 'done').length;
        return [
          {
            value: `${formatNumber(objective.amount?.current ?? 0)} ${metric?.unit ?? ''}`,
            label: metric?.aggregation === 'max' ? 'Meilleure valeur' : 'Cumulé',
          },
          { value: `${done}`, label: 'Séances' },
        ];
      }
      case 'habit': {
        const mine = objective.checkIns
          .filter(({ userId }) => userId === this.store.currentUserId())
          .map(({ date }) => date);
        return [
          { value: `${mine.length}`, label: 'Jours réussis' },
          { value: `${longestStreak(mine)} j`, label: 'Meilleure série' },
        ];
      }
      case 'children':
        return [
          { value: `${objective.completedChildCount} / ${objective.childCount}`, label: 'Terminés' },
          { value: `${objective.childCount - objective.completedChildCount}`, label: 'Restants' },
        ];
      case 'manual':
      case 'none':
        return [];
    }
  }

  private deadlineTile(objective: ObjectiveDetail): StatTile {
    if (objective.status === 'completed' && objective.completedAt) {
      return { value: 'Terminé', label: formatShortDate(toIsoDate(new Date(objective.completedAt))) };
    }
    if (!objective.dueDate) return { value: '—', label: 'Sans échéance' };
    const days = daysBetween(this.store.today(), objective.dueDate);
    const unit = Math.abs(days) > 1 ? 'jours' : 'jour';
    return days >= 0
      ? { value: `${days} ${unit}`, label: 'Restants' }
      : { value: `${-days} ${unit}`, label: 'De retard' };
  }
}
