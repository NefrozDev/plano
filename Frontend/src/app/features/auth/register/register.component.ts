import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { LanguageService } from '../../../core/i18n/language.service';
import {
  TOO_MANY_ATTEMPTS_MESSAGE,
  UNEXPECTED_ERROR_MESSAGE,
  httpErrorMessage,
} from '../../../core/http/http-error-message';
import { AuthShellComponent } from '../auth-shell/auth-shell.component';

export const matchingPasswordsValidator: ValidatorFn = (
  group: AbstractControl,
): ValidationErrors | null => {
  const password = group.get('password')?.value as string | undefined;
  const confirmation = group.get('passwordConfirmation')?.value as
    string | undefined;

  return password && confirmation && password !== confirmation
    ? { passwordMismatch: true }
    : null;
};

type RegisterField =
  | 'lastName'
  | 'firstName'
  | 'username'
  | 'email'
  | 'password'
  | 'passwordConfirmation'
  | 'acceptedTerms';

@Component({
  selector: 'app-register',
  imports: [AuthShellComponent, ReactiveFormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);

  readonly form = this.formBuilder.nonNullable.group(
    {
      lastName: ['', [Validators.required, Validators.maxLength(80)]],
      firstName: ['', [Validators.required, Validators.maxLength(80)]],
      username: [
        '',
        [
          Validators.required,
          Validators.minLength(3),
          Validators.maxLength(30),
          Validators.pattern(/^[A-Za-z0-9._-]+$/),
        ],
      ],
      email: [
        '',
        [Validators.required, Validators.email, Validators.maxLength(254)],
      ],
      password: [
        '',
        [
          Validators.required,
          Validators.minLength(8),
          Validators.maxLength(128),
        ],
      ],
      passwordConfirmation: ['', [Validators.required]],
      acceptedTerms: [false, [Validators.requiredTrue]],
    },
    { validators: matchingPasswordsValidator },
  );

  readonly submitted = signal(false);
  readonly submitting = signal(false);
  readonly submissionError = signal('');

  showError(controlName: RegisterField): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.touched || this.submitted());
  }

  passwordConfirmationError(): string {
    const confirmation = this.form.controls.passwordConfirmation;
    if (!(confirmation.touched || this.submitted())) {
      return '';
    }

    if (confirmation.hasError('required')) {
      return 'Confirmez votre mot de passe.';
    }

    return this.form.hasError('passwordMismatch')
      ? 'Les mots de passe ne correspondent pas.'
      : '';
  }

  submit(): void {
    this.submitted.set(true);
    this.submissionError.set('');
    this.normalizeTextFields();

    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    const value = this.form.getRawValue();

    this.auth
      .register({
        firstName: value.firstName.trim(),
        lastName: value.lastName.trim(),
        username: value.username.trim(),
        email: value.email.trim().toLowerCase(),
        password: value.password,
        acceptedTerms: value.acceptedTerms,
        locale: this.language.active(),
      })
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: () => void this.router.navigateByUrl('/groups'),
        error: (error: unknown) =>
          this.submissionError.set(this.registrationErrorMessage(error)),
      });
  }

  private normalizeTextFields(): void {
    const value = this.form.getRawValue();
    this.form.patchValue(
      {
        firstName: value.firstName.trim(),
        lastName: value.lastName.trim(),
        username: value.username.trim(),
        email: value.email.trim(),
      },
      { emitEvent: false },
    );
    this.form.updateValueAndValidity({ emitEvent: false });
  }

  /** The API does not say which of username or e-mail is taken, so accounts cannot be enumerated. */
  private registrationErrorMessage(error: unknown): string {
    return httpErrorMessage(error, {
      unexpected: UNEXPECTED_ERROR_MESSAGE,
      byStatus: {
        400: 'Certaines informations sont invalides. Vérifiez le formulaire.',
        409: 'Un compte utilise déjà ce nom d’utilisateur ou cette adresse e-mail.',
        429: TOO_MANY_ATTEMPTS_MESSAGE,
      },
      fallback: 'La création du compte a échoué. Veuillez réessayer.',
    });
  }
}
