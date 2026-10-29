import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import {
  TOO_MANY_ATTEMPTS_MESSAGE,
  UNEXPECTED_ERROR_MESSAGE,
  httpErrorMessage,
} from '../../../core/http/http-error-message';
import { AuthShellComponent } from '../auth-shell/auth-shell.component';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function sameAsPassword(control: AbstractControl): ValidationErrors | null {
  const password = control.parent?.get('password')?.value as string | undefined;
  return control.value === password ? null : { mismatch: true };
}

type Field = 'password' | 'confirmation';

/**
 * `/reset-password#token=…`, opened from the recovery e-mail. The token comes
 * in the fragment (never sent to a server) and is dropped from the address bar
 * once read.
 */
@Component({
  selector: 'app-reset-password',
  imports: [AuthShellComponent, ReactiveFormsModule, RouterLink],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetPasswordComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  /** Null when the link is incomplete. */
  readonly token: string | null;

  readonly form = inject(FormBuilder).nonNullable.group({
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128)]],
    confirmation: ['', [Validators.required, sameAsPassword]],
  });
  readonly submitted = signal(false);
  readonly submitting = signal(false);
  readonly submissionError = signal('');
  /** The link no longer works: offer a new one. */
  readonly expired = signal(false);
  readonly done = signal(false);

  constructor() {
    const token = new URLSearchParams(inject(ActivatedRoute).snapshot.fragment ?? '').get('token');
    this.token = token && TOKEN_PATTERN.test(token) ? token : null;
    if (token) void this.router.navigate([], { fragment: undefined, replaceUrl: true });
    // A new password invalidates an earlier confirmation.
    this.form.controls.password.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.form.controls.confirmation.updateValueAndValidity({ emitEvent: false }));
  }

  showError(field: Field): boolean {
    const control = this.form.controls[field];
    return control.invalid && (control.touched || this.submitted());
  }

  fieldError(field: Field): string {
    const control = this.form.controls[field];
    if (field === 'confirmation') {
      return control.hasError('required')
        ? 'Saisissez à nouveau le mot de passe.'
        : 'Les deux mots de passe ne correspondent pas.';
    }
    if (control.hasError('required')) return 'Choisissez un mot de passe.';
    return control.hasError('minlength')
      ? 'Le mot de passe doit contenir au moins 8 caractères.'
      : 'Le mot de passe ne peut pas dépasser 128 caractères.';
  }

  submit(): void {
    this.submitted.set(true);
    this.submissionError.set('');
    if (!this.token || this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.auth
      .confirmPasswordReset(this.token, this.form.getRawValue().password)
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: () => this.done.set(true),
        error: (error: unknown) => {
          this.expired.set(error instanceof HttpErrorResponse && error.status === 400);
          this.submissionError.set(
            httpErrorMessage(error, {
              useServerMessage: true,
              unexpected: UNEXPECTED_ERROR_MESSAGE,
              byStatus: { 429: TOO_MANY_ATTEMPTS_MESSAGE },
              fallback: 'Le mot de passe n’a pas pu être changé. Veuillez réessayer.',
            }),
          );
        },
      });
  }
}
