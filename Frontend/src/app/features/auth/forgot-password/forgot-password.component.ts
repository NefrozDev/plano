import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import {
  TOO_MANY_ATTEMPTS_MESSAGE,
  UNEXPECTED_ERROR_MESSAGE,
  httpErrorMessage,
} from '../../../core/http/http-error-message';
import { AuthShellComponent } from '../auth-shell/auth-shell.component';

/** `/forgot-password`: asks for the account's e-mail address and sends the recovery link. */
@Component({
  selector: 'app-forgot-password',
  imports: [AuthShellComponent, ReactiveFormsModule, RouterLink],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPasswordComponent {
  private readonly auth = inject(AuthService);

  readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
  });
  readonly submitted = signal(false);
  readonly submitting = signal(false);
  readonly submissionError = signal('');
  /** The address the link was sent to; the API never says whether it has an account. */
  readonly sentTo = signal('');

  showError(): boolean {
    const control = this.form.controls.email;
    return control.invalid && (control.touched || this.submitted());
  }

  fieldError(): string {
    return this.form.controls.email.hasError('required')
      ? 'Saisissez votre adresse e-mail.'
      : 'Saisissez une adresse e-mail valide.';
  }

  submit(): void {
    this.submitted.set(true);
    this.submissionError.set('');
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }
    const email = this.form.getRawValue().email.trim();
    this.submitting.set(true);
    this.auth
      .requestPasswordReset(email)
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: () => this.sentTo.set(email),
        error: (error: unknown) =>
          this.submissionError.set(
            httpErrorMessage(error, {
              unexpected: UNEXPECTED_ERROR_MESSAGE,
              byStatus: { 429: TOO_MANY_ATTEMPTS_MESSAGE },
              fallback: 'L’e-mail n’a pas pu être envoyé. Veuillez réessayer.',
            }),
          ),
      });
  }
}
