import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject } from '@angular/core';
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
import { AuthShellComponent } from '../auth-shell/auth-shell.component';

export const matchingPasswordsValidator: ValidatorFn = (
  group: AbstractControl,
): ValidationErrors | null => {
  const password = group.get('password')?.value as string | undefined;
  const confirmation = group.get('passwordConfirmation')?.value as
    | string
    | undefined;

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
  standalone: true,
  imports: [AuthShellComponent, ReactiveFormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
})
export class RegisterComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

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

  submitted = false;
  submitting = false;
  submissionError = '';
  readonly apiFieldErrors: Partial<Record<RegisterField, string>> = {};

  showError(controlName: RegisterField): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.touched || this.submitted);
  }

  passwordConfirmationError(): string {
    const confirmation = this.form.controls.passwordConfirmation;
    if (!(confirmation.touched || this.submitted)) {
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
    this.submitted = true;
    this.clearApiErrors();
    this.normalizeTextFields();

    if (this.form.invalid || this.submitting) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting = true;
    const value = this.form.getRawValue();

    this.auth
      .register({
        firstName: value.firstName.trim(),
        lastName: value.lastName.trim(),
        username: value.username.trim(),
        email: value.email.trim().toLowerCase(),
        password: value.password,
        acceptedTerms: value.acceptedTerms,
      })
      .pipe(finalize(() => (this.submitting = false)))
      .subscribe({
        next: () => void this.router.navigateByUrl('/'),
        error: (error: unknown) => this.handleRegistrationError(error),
      });
  }

  private clearApiErrors(): void {
    this.submissionError = '';
    delete this.apiFieldErrors.username;
    delete this.apiFieldErrors.email;
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

  private handleRegistrationError(error: unknown): void {
    if (!(error instanceof HttpErrorResponse)) {
      this.submissionError =
        'Une erreur inattendue est survenue. Veuillez réessayer.';
      return;
    }

    if (error.status === 0) {
      this.submissionError =
        'Impossible de joindre Plano. Vérifiez votre connexion.';
      return;
    }

    if (error.status === 409) {
      const serverMessage = this.serverMessage(error).toLowerCase();
      if (serverMessage.includes('mail')) {
        this.apiFieldErrors.email = 'Cette adresse e-mail est déjà utilisée.';
      } else if (
        serverMessage.includes('username') ||
        serverMessage.includes('utilisateur')
      ) {
        this.apiFieldErrors.username =
          'Ce nom d’utilisateur est déjà utilisé.';
      } else {
        this.submissionError =
          'Un compte utilise déjà ce nom d’utilisateur ou cette adresse e-mail.';
      }
      return;
    }

    if (error.status === 400) {
      this.submissionError =
        'Certaines informations sont invalides. Vérifiez le formulaire.';
      return;
    }

    this.submissionError =
      'La création du compte a échoué. Veuillez réessayer.';
  }

  private serverMessage(error: HttpErrorResponse): string {
    const message = (error.error as { message?: unknown } | null)?.message;
    return Array.isArray(message) ? message.join(' ') : String(message ?? '');
  }
}
