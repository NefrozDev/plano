import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { AuthShellComponent } from '../auth-shell/auth-shell.component';

function safeReturnUrl(value: string | undefined): string {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/';
}

/**
 * The first screen after signing in to Plano for the first time: the Synapse
 * account covers signing in, Plano's own terms cover what Plano does.
 */
@Component({
  selector: 'app-welcome',
  imports: [AuthShellComponent, RouterLink],
  templateUrl: './welcome.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WelcomeComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** ?returnUrl=: where the person was going (authenticatedGuard). */
  private readonly returnUrl =
    inject(ActivatedRoute).snapshot.queryParamMap.get('returnUrl') ?? undefined;

  readonly user = this.auth.user;
  readonly accepting = signal(false);
  readonly failed = signal(false);

  accept(): void {
    if (this.accepting()) return;
    this.accepting.set(true);
    this.failed.set(false);
    this.auth.acceptTerms().subscribe({
      next: () => void this.router.navigateByUrl(safeReturnUrl(this.returnUrl)),
      error: () => {
        this.accepting.set(false);
        this.failed.set(true);
      },
    });
  }
}
