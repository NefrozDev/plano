import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { PlanoDataStore } from '../../core/data/plano-data.store';
import { BottomNavComponent } from '../../shared/ui/bottom-nav.component';
import {
  formatDate,
  objectiveProgress,
  objectiveTint,
} from '../objectives/objective.utils';
import { ObjectivesStore } from '../objectives/objectives.store';
import { AgendaStore } from '../agenda/agenda.store';
import { formatTime, timePart } from '../agenda/agenda.utils';
import { ObjectiveIconComponent } from '../objectives/ui/objective-icon.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, BottomNavComponent, ObjectiveIconComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly appData = inject(PlanoDataStore);
  private readonly objectivesStore = inject(ObjectivesStore);
  private readonly agendaStore = inject(AgendaStore);

  readonly weekDays = this.appData.data().dashboard.weekDays;
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
      .sort((first, second) => (first.dueDate ?? '9999').localeCompare(second.dueDate ?? '9999'))
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
  readonly profileMenuOpen = signal(false);
  readonly logoutPending = signal(false);
  readonly logoutError = signal('');
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

  toggleProfileMenu(): void {
    this.profileMenuOpen.update((open) => !open);
  }

  logout(): void {
    if (this.logoutPending()) return;
    this.logoutError.set('');
    this.logoutPending.set(true);
    this.auth
      .logout()
      .pipe(finalize(() => this.logoutPending.set(false)))
      .subscribe({
        next: () => void this.router.navigateByUrl('/login'),
        error: () =>
          this.logoutError.set('La déconnexion a échoué. Veuillez réessayer.'),
      });
  }
}
