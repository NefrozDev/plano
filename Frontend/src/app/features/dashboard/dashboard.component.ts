import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';

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

  readonly navigation: readonly NavigationItem[] = [
    'Accueil',
    'Agenda',
    'Liste',
    'Objectifs',
  ];
  readonly weekDays = [
    { label: 'lun', date: 17 },
    { label: 'mar', date: 18 },
    { label: 'mer', date: 19 },
    { label: 'jeu', date: 20, selected: true },
    { label: 'ven', date: 21, hasEvent: true },
    { label: 'sam', date: 22 },
    { label: 'dim', date: 23, hasEvent: true },
  ];
  readonly tasks = signal([
    { label: 'Préparer la présentation', done: false },
    { label: '30 minutes de course à pied', done: true },
    { label: 'Réserver le restaurant', done: false },
  ]);
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
    this.activeNavigation = item;
  }

  toggleTask(index: number): void {
    this.tasks.update((tasks) =>
      tasks.map((task, taskIndex) =>
        taskIndex === index ? { ...task, done: !task.done } : task,
      ),
    );
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
