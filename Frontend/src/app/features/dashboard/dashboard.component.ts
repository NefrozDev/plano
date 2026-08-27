import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { PlanoDataStore } from '../../core/data/plano-data.store';

type NavigationItem = 'Accueil' | 'Agenda' | 'Liste' | 'Objectifs';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly appData = inject(PlanoDataStore);

  readonly navigation: readonly NavigationItem[] = [
    'Accueil',
    'Agenda',
    'Liste',
    'Objectifs',
  ];
  readonly weekDays = this.appData.data().dashboard.weekDays;
  readonly tasks = computed(() => this.appData.data().dashboard.tasks);
  readonly completedTasks = computed(
    () => this.tasks().filter((task) => task.done).length,
  );
  readonly displayName = computed(
    () => this.auth.user()?.firstName || this.auth.user()?.username || 'vous',
  );
  readonly profileMenuOpen = signal(false);
  readonly logoutPending = signal(false);
  readonly logoutError = signal('');
  activeNavigation: NavigationItem = 'Accueil';

  selectNavigation(item: NavigationItem): void {
    if (item === 'Liste') {
      void this.router.navigateByUrl('/lists');
      return;
    }
    this.activeNavigation = item;
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
