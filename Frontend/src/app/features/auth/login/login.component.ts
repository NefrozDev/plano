import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../../../core/auth/auth.service';
import { BROWSER_LOCATION } from '../../../core/browser/browser-location';
import { AuthShellComponent } from '../auth-shell/auth-shell.component';

/** A path of Plano to come back to, never another site. */
function safeReturnUrl(value: string | undefined): string {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/';
}

/**
 * Plano signs in with the Synapse account, shared by every Synapse
 * Engineering app: the button opens its pages, which come back here signed in.
 */
@Component({
  selector: 'app-login',
  imports: [AuthShellComponent, TranslocoPipe],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly location = inject(BROWSER_LOCATION);
  private readonly transloco = inject(TranslocoService);

  private readonly query = inject(ActivatedRoute).snapshot.queryParamMap;

  readonly leaving = signal(false);
  /** ?signIn=cancelled|failed: how the last sign-in came back, as a translation key. */
  readonly notice = signal(this.explain(this.query.get('signIn')));

  private explain(signIn: string | null): string {
    switch (signIn) {
      case 'cancelled':
        return 'auth.login.cancelled';
      case 'failed':
        return 'auth.login.failed';
      default:
        return '';
    }
  }

  start(): void {
    this.leaving.set(true);
    this.location.assign(
      this.auth.signInUrl(safeReturnUrl(this.query.get('returnUrl') ?? undefined), this.transloco.getActiveLang()),
    );
  }
}
