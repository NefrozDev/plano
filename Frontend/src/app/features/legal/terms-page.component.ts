import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthShellComponent } from '../auth/auth-shell/auth-shell.component';
import { TermsContentComponent } from './terms-content.component';

/** The terms at their own address, signed in or not: from the settings or a shared link. */
@Component({
  selector: 'app-terms-page',
  imports: [AuthShellComponent, TermsContentComponent, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-auth-shell [compact]="true" [backLabel]="'terms.back' | transloco" (back)="back()">
      <section class="auth-card" aria-labelledby="terms-title">
        <h2 id="terms-title">{{ 'titles.terms' | transloco }}</h2>
        <app-terms-content />
      </section>
    </app-auth-shell>
  `,
  styles: `
    h2 { margin-bottom: .4rem !important; }
  `,
})
export class TermsPageComponent {
  private readonly location = inject(Location);
  private readonly router = inject(Router);

  /** Back where the user came from; home (or sign-in) when the page was opened directly. */
  back(): void {
    if (this.router.lastSuccessfulNavigation()?.previousNavigation) this.location.back();
    else void this.router.navigateByUrl('/');
  }
}
