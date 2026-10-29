import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { PlanoDataStore } from '../../core/data/plano-data.store';
import { AutofocusDirective } from '../../shared/ui/autofocus.directive';
import { BottomNavComponent } from '../../shared/ui/bottom-nav.component';
import { UserAvatarComponent } from '../../shared/ui/user-avatar.component';
import { addDays, compareDueDates, createId, formatDate, parseIsoDate, startOfWeek } from '../../core/time/dates';
import { objectiveProgress, objectiveTint } from '../objectives/objective.utils';
import { ObjectivesStore } from '../objectives/objectives.store';
import { AgendaStore } from '../agenda/agenda.store';
import { ObjectiveIconComponent } from '../objectives/ui/objective-icon.component';

const WEEKDAY_LABELS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, TranslocoPipe, AutofocusDirective, BottomNavComponent, ObjectiveIconComponent, UserAvatarComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  private readonly auth = inject(AuthService);
  private readonly appData = inject(PlanoDataStore);
  private readonly objectivesStore = inject(ObjectivesStore);
  private readonly agendaStore = inject(AgendaStore);

  /** The current week, today highlighted, a dot on days with agenda items. */
  readonly weekDays = computed(() => {
    const today = this.agendaStore.today();
    const first = startOfWeek(today, this.agendaStore.settings().weekStartsOn);
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(first, index);
      return {
        date,
        label: WEEKDAY_LABELS[parseIsoDate(date).getDay()],
        day: parseIsoDate(date).getDate(),
        selected: date === today,
        hasEvent: this.agendaStore.itemsOn(date).length > 0,
      };
    });
  });
  readonly weekLabel = computed(() => {
    const days = this.weekDays();
    return `Semaine du ${days[0].day} au ${days[6].day}`;
  });
  readonly tasks = computed(() => this.appData.data().dashboard.tasks);
  readonly completedTasks = computed(
    () => this.tasks().filter((task) => task.done).length,
  );
  readonly goals = computed(() =>
    this.objectivesStore
      .objectives()
      .filter((objective) => objective.status === 'active' && !objective.archived)
      .sort((first, second) => compareDueDates(first.dueDate, second.dueDate))
      .slice(0, 2)
      .map((objective) => ({
        id: objective.id,
        title: objective.title,
        category: objective.category,
        progress: objectiveProgress(objective),
        due: objective.dueDate ? `échéance : ${formatDate(objective.dueDate)}` : 'sans échéance',
        tint: objectiveTint(objective.category, this.objectivesStore.settings().categoryColors),
      })),
  );
  readonly displayName = computed(
    () => this.auth.user()?.firstName || this.auth.user()?.username || 'vous',
  );
  readonly user = this.auth.user;
  readonly addingTask = signal(false);
  readonly newTaskValue = signal('');

  constructor() {
    // The week strip's event dots include list reminders served by the API.
    this.agendaStore.loadTasks();
  }

  toggleTask(index: number): void {
    this.appData.update((data) => ({
      ...data,
      dashboard: {
        ...data.dashboard,
        tasks: data.dashboard.tasks.map((task, taskIndex) =>
          taskIndex === index ? { ...task, done: !task.done } : task,
        ),
      },
    }));
  }

  beginAddingTask(): void {
    this.newTaskValue.set('');
    this.addingTask.set(true);
  }

  /** Runs on Enter and on blur; an empty field just closes. */
  finishAddingTask(): void {
    if (!this.addingTask()) return;
    const label = this.newTaskValue().trim();
    this.cancelAddingTask();
    if (!label) return;
    this.appData.update((data) => ({
      ...data,
      dashboard: {
        ...data.dashboard,
        tasks: [...data.dashboard.tasks, { id: createId('task'), label, done: false }],
      },
    }));
  }

  cancelAddingTask(): void {
    this.addingTask.set(false);
    this.newTaskValue.set('');
  }
}
