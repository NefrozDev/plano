import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthUser } from '../../../core/auth/auth.models';
import { AuthService } from '../../../core/auth/auth.service';
import { RegisterComponent } from './register.component';

describe('RegisterComponent', () => {
  let auth: jasmine.SpyObj<AuthService>;
  let component: RegisterComponent;
  let router: Router;

  const user: AuthUser = {
    id: 'user-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    username: 'ada',
    email: 'ada@example.com',
  };

  beforeEach(async () => {
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['register']);
    await TestBed.configureTestingModule({
      imports: [RegisterComponent],
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    }).compileComponents();

    component = TestBed.createComponent(RegisterComponent).componentInstance;
    router = TestBed.inject(Router);
  });

  function fillValidForm(): void {
    component.form.setValue({
      lastName: 'Lovelace',
      firstName: 'Ada',
      username: 'ada',
      email: 'ada@example.com',
      password: 'password123',
      passwordConfirmation: 'password123',
      acceptedTerms: true,
    });
  }

  it('rejects mismatched password confirmation locally', () => {
    component.form.setValue({
      lastName: 'Lovelace',
      firstName: 'Ada',
      username: 'ada',
      email: 'ada@example.com',
      password: 'password123',
      passwordConfirmation: 'different123',
      acceptedTerms: true,
    });

    component.submit();

    expect(component.form.hasError('passwordMismatch')).toBeTrue();
    expect(component.passwordConfirmationError()).toContain(
      'correspondent pas',
    );
    expect(auth.register).not.toHaveBeenCalled();
  });

  it('reports confirmation errors only after interaction or submission', () => {
    expect(component.passwordConfirmationError()).toBe('');

    component.form.controls.passwordConfirmation.markAsTouched();
    expect(component.passwordConfirmationError()).toContain('Confirmez');

    fillValidForm();
    component.form.controls.passwordConfirmation.markAsTouched();
    expect(component.passwordConfirmationError()).toBe('');
  });

  it('shows invalid fields after they are touched or submitted', () => {
    expect(component.showError('email')).toBeFalse();
    component.form.controls.email.markAsTouched();
    expect(component.showError('email')).toBeTrue();
    component.submitted = true;
    expect(component.showError('acceptedTerms')).toBeTrue();
  });

  it('enforces the username format used by the backend', () => {
    component.form.controls.username.setValue('not allowed!');

    expect(component.form.controls.username.hasError('pattern')).toBeTrue();
  });

  it('submits only the backend contract and then opens group setup', () => {
    auth.register.and.returnValue(of(user));
    const navigate = spyOn(router, 'navigateByUrl').and.resolveTo(true);
    component.form.setValue({
      lastName: '  Lovelace ',
      firstName: ' Ada  ',
      username: ' ada ',
      email: ' ADA@EXAMPLE.COM ',
      password: 'password123',
      passwordConfirmation: 'password123',
      acceptedTerms: true,
    });

    component.submit();

    expect(auth.register).toHaveBeenCalledOnceWith({
      firstName: 'Ada',
      lastName: 'Lovelace',
      username: 'ada',
      email: 'ada@example.com',
      password: 'password123',
      acceptedTerms: true,
    });
    expect(navigate).toHaveBeenCalledOnceWith('/group/setup');
  });

  it('does not submit twice while registration is pending', () => {
    fillValidForm();
    component.submitting = true;

    component.submit();

    expect(auth.register).not.toHaveBeenCalled();
  });

  it('maps an e-mail conflict next to the e-mail field', () => {
    auth.register.and.returnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            statusText: 'Conflict',
            error: { message: 'email already exists' },
          }),
      ),
    );
    component.form.setValue({
      lastName: 'Lovelace',
      firstName: 'Ada',
      username: 'ada',
      email: 'ada@example.com',
      password: 'password123',
      passwordConfirmation: 'password123',
      acceptedTerms: true,
    });

    component.submit();

    expect(component.apiFieldErrors.email).toContain('déjà utilisée');
    expect(component.submissionError).toBe('');
  });

  it('maps username conflicts from either supported server wording', () => {
    fillValidForm();
    auth.register.and.returnValues(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: { message: 'username already exists' },
          }),
      ),
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: { message: 'nom utilisateur déjà utilisé' },
          }),
      ),
    );

    component.submit();
    expect(component.apiFieldErrors.username).toContain('déjà utilisé');
    component.submit();
    expect(component.apiFieldErrors.username).toContain('déjà utilisé');
  });

  it('uses a generic conflict message when the server names no field', () => {
    fillValidForm();
    auth.register.and.returnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: { message: ['account', 'already exists'] },
          }),
      ),
    );

    component.submit();

    expect(component.submissionError).toContain('Un compte utilise déjà');
  });

  it('maps offline, malformed, validation, and server failures', () => {
    fillValidForm();
    auth.register.and.returnValues(
      throwError(() => new HttpErrorResponse({ status: 0 })),
      throwError(() => new Error('unexpected')),
      throwError(() => new HttpErrorResponse({ status: 400 })),
      throwError(() => new HttpErrorResponse({ status: 500 })),
    );

    component.submit();
    expect(component.submissionError).toContain('Impossible de joindre');
    component.submit();
    expect(component.submissionError).toContain('inattendue');
    component.submit();
    expect(component.submissionError).toContain('informations sont invalides');
    component.submit();
    expect(component.submissionError).toContain('création du compte a échoué');
  });
});
