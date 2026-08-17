import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';

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

  readonly title = 'Plano';
  readonly navigation = ['Today', 'Plan', 'Progress', 'Profile'] as const;
  readonly displayName = computed(
    () => this.auth.user()?.firstName || this.auth.user()?.username || 'vous',
  );
  readonly initials = computed(() => {
    const user = this.auth.user();
    if (!user) {
      return 'P';
    }

    const first = user.firstName.at(0) ?? user.username.at(0) ?? '';
    const last = user.lastName.at(0) ?? '';
    return `${first}${last}`.toUpperCase();
  });
  readonly logoutPending = signal(false);
  readonly logoutError = signal('');

  activeNavigation: (typeof this.navigation)[number] = 'Today';

  selectNavigation(item: (typeof this.navigation)[number]): void {
    this.activeNavigation = item;
  }

  logout(): void {
    if (this.logoutPending()) {
      return;
    }

    this.logoutError.set('');
    this.logoutPending.set(true);
    this.auth
      .logout()
      .pipe(finalize(() => this.logoutPending.set(false)))
      .subscribe({
        next: () => void this.router.navigateByUrl('/login'),
        error: () =>
          this.logoutError.set(
            'La déconnexion a échoué. Veuillez réessayer.',
          ),
      });
  }
}
