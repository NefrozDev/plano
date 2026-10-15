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
import { RouterLink } from '@angular/router';
import type {
  DueReminder,
  Objective,
  ObjectiveContact,
  ObjectiveReminder,
} from '@plano/common';
import {
  DUE_REMINDER_LABELS,
  WEEKDAY_LABELS,
  daysBetween,
  formatDate,
  formatNumber,
  formatShortDate,
  longestStreak,
  metricCurrent,
  objectiveProgress,
  objectiveTint,
  progressLabel,
  reminderLabel,
} from '../../objective.utils';
import { ObjectivesStore } from '../../objectives.store';
import { ObjectiveIconComponent } from '../../ui/objective-icon.component';
import { ObjectiveContext } from '../objective-context';

type EditableRow = 'description' | 'plan' | 'reminder';

interface StatTile {
  value: string;
  label: string;
}

const MAX_AVATARS = 4;

@Component({
  selector: 'app-objective-summary',
  standalone: true,
  imports: [RouterLink, ObjectiveIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './objective-summary.component.html',
  styleUrl: './objective-summary.component.scss',
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

  readonly view = computed(() => {
    const objective = this.objective();
    if (!objective) return null;
    const settings = this.store.settings();
    const progress = objectiveProgress(objective);
    const people = this.people(objective);
    return {
      progress,
      progressText: settings.showPercentage ? `${progress} %` : progressLabel(objective),
      tint: objectiveTint(objective.category, settings.categoryColors),
      due: objective.dueDate ? `Échéance : ${formatDate(objective.dueDate)}` : 'Sans échéance',
      tiles: [...this.trackingTiles(objective), this.deadlineTile(objective)],
      reminder: reminderLabel(objective.reminder),
      dueReminder: DUE_REMINDER_LABELS[objective.dueReminder],
      avatars: people.slice(0, MAX_AVATARS),
      extraPeople: Math.max(0, people.length - MAX_AVATARS),
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
    if (objective && title) this.store.update(objective.id, { title });
    this.editingTitle.set(false);
  }

  updateText(field: 'description' | 'plan', value: string): void {
    const objective = this.objective();
    if (objective) this.store.update(objective.id, { [field]: value.trim() });
  }

  updateReminder(changes: Partial<ObjectiveReminder>): void {
    const objective = this.objective();
    if (objective) this.store.update(objective.id, { reminder: { ...objective.reminder, ...changes } });
  }

  updateDueReminder(dueReminder: DueReminder): void {
    const objective = this.objective();
    if (objective) this.store.update(objective.id, { dueReminder });
  }

  private people(objective: Objective): ObjectiveContact[] {
    const me = this.store.currentUserId();
    const ids = [objective.ownerId, ...objective.sharedWith].filter((id) => id !== me);
    return [...new Set(ids)]
      .map((id) => this.store.contact(id))
      .filter((contact): contact is ObjectiveContact => !!contact);
  }

  private trackingTiles(objective: Objective): StatTile[] {
    switch (objective.tracking) {
      case 'metric': {
        const metric = objective.metric;
        const done = objective.sessions.filter((session) => session.status === 'done').length;
        return [
          {
            value: `${formatNumber(metricCurrent(objective))} ${metric?.unit ?? ''}`,
            label: metric?.aggregation === 'max' ? 'Meilleure séance' : 'Cumulé',
          },
          { value: metric?.sessionsTarget ? `${done} / ${metric.sessionsTarget}` : `${done}`, label: 'Séances' },
        ];
      }
      case 'steps': {
        const done = objective.steps.filter((step) => step.done).length;
        return [
          { value: `${done} / ${objective.steps.length}`, label: 'Étapes' },
          { value: `${objective.steps.length - done}`, label: 'Restantes' },
        ];
      }
      case 'habit': {
        const checkIns = objective.habit?.checkIns ?? [];
        return [
          { value: `${checkIns.length}`, label: 'Jours réussis' },
          { value: `${longestStreak(checkIns)} j`, label: 'Meilleure série' },
        ];
      }
    }
  }

  private deadlineTile(objective: Objective): StatTile {
    if (objective.status === 'completed' && objective.completedOn) {
      return { value: 'Terminé', label: formatShortDate(objective.completedOn) };
    }
    if (!objective.dueDate) return { value: '—', label: 'Sans échéance' };
    const days = daysBetween(this.store.today(), objective.dueDate);
    const unit = Math.abs(days) > 1 ? 'jours' : 'jour';
    return days >= 0
      ? { value: `${days} ${unit}`, label: 'Restants' }
      : { value: `${-days} ${unit}`, label: 'De retard' };
  }
}
