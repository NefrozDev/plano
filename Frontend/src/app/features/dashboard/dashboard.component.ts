import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { PlanoDataStore } from '../../core/data/plano-data.store';
import { BottomNavComponent } from '../../shared/ui/bottom-nav.component';
import { UserAvatarComponent } from '../../shared/ui/user-avatar.component';
import { compareDueDates, formatDate } from '../../core/time/dates';
import { objectiveProgress, objectiveTint } from '../objectives/objective.utils';
import { ObjectivesStore } from '../objectives/objectives.store';
import { AgendaStore } from '../agenda/agenda.store';
import { formatTime, timePart } from '../agenda/agenda.utils';
import { ObjectiveIconComponent } from '../objectives/ui/objective-icon.component';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, TranslocoPipe, BottomNavComponent, ObjectiveIconComponent, UserAvatarComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  private readonly auth = inject(AuthService);
  private readonly appData = inject(PlanoDataStore);
  private readonly objectivesStore = inject(ObjectivesStore);
  private readonly agendaStore = inject(AgendaStore);

  readonly weekDays = computed(() => this.appData.data().dashboard.weekDays);
  readonly tasks = computed(() => this.appData.data().dashboard.tasks);
  readonly completedTasks = computed(
    () => this.tasks().filter((task) => task.done).length,
  );
  readonly todayItems = computed(() => this.agendaStore.itemsOn(this.agendaStore.today()));
  readonly agendaPreview = computed(() =>
    this.todayItems()
      .slice(0, 3)
      .map((item) => ({
        item,
        time: item.allDay ? 'Journée' : formatTime(timePart(item.start), this.agendaStore.settings().hourFormat),
      })),
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

  constructor() {
    // Today's agenda preview includes list reminders served by the API.
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
}
