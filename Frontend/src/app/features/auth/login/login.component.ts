import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { AuthShellComponent } from '../auth-shell/auth-shell.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [AuthShellComponent, ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly form = this.formBuilder.nonNullable.group({
    username: ['', [Validators.required, Validators.maxLength(30)]],
    password: ['', [Validators.required, Validators.maxLength(128)]],
  });

  submitted = false;
  submitting = false;
  submissionError = '';
  recoveryMessage = '';

  showError(controlName: 'username' | 'password'): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.touched || this.submitted);
  }

  fieldError(controlName: 'username' | 'password'): string {
    const control = this.form.controls[controlName];
    if (control.hasError('required')) {
      return controlName === 'username'
        ? 'Saisissez votre nom d’utilisateur.'
        : 'Saisissez votre mot de passe.';
    }

    return controlName === 'username'
      ? 'Le nom d’utilisateur ne peut pas dépasser 30 caractères.'
      : 'Le mot de passe ne peut pas dépasser 128 caractères.';
  }

  showRecoveryInfo(): void {
    this.recoveryMessage =
      'La récupération du mot de passe sera prochainement disponible.';
  }

  submit(): void {
    this.submitted = true;
    this.submissionError = '';
    this.recoveryMessage = '';

    if (this.form.invalid || this.submitting) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting = true;
    const rawValue = this.form.getRawValue();

    this.auth
      .login({
        username: rawValue.username.trim(),
        password: rawValue.password,
      })
      .pipe(finalize(() => (this.submitting = false)))
      .subscribe({
        next: () => void this.router.navigateByUrl(this.safeReturnUrl()),
        error: (error: unknown) => {
          this.submissionError = this.loginErrorMessage(error);
        },
      });
  }

  private safeReturnUrl(): string {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    return returnUrl?.startsWith('/') && !returnUrl.startsWith('//')
      ? returnUrl
      : '/';
  }

  private loginErrorMessage(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) {
      return 'Une erreur inattendue est survenue. Veuillez réessayer.';
    }

    if (error.status === 0) {
      return 'Impossible de joindre Plano. Vérifiez votre connexion.';
    }

    if (error.status === 400 || error.status === 401) {
      return 'Nom d’utilisateur ou mot de passe incorrect.';
    }

    return 'La connexion a échoué. Veuillez réessayer.';
  }
}
