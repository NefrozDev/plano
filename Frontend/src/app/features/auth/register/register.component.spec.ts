import type { MockedObject } from 'vitest';
import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthUser } from '../../../core/auth/auth.models';
import { AuthService } from '../../../core/auth/auth.service';
import { RegisterComponent } from './register.component';

describe('RegisterComponent', () => {
  let auth: MockedObject<Pick<AuthService, 'register'>>;
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
    auth = {
      register: vi.fn().mockName('AuthService.register'),
    };
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

    expect(component.form.hasError('passwordMismatch')).toBe(true);
    expect(component.passwordConfirmationError()).toContain('correspondent pas');
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
    expect(component.showError('email')).toBe(false);
    component.form.controls.email.markAsTouched();
    expect(component.showError('email')).toBe(true);
    component.submitted.set(true);
    expect(component.showError('acceptedTerms')).toBe(true);
  });

  it('enforces the username format used by the backend', () => {
    component.form.controls.username.setValue('not allowed!');

    expect(component.form.controls.username.hasError('pattern')).toBe(true);
  });

  it('submits only the backend contract and then opens group setup', () => {
    auth.register.mockReturnValue(of(user));
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
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

    expect(auth.register).toHaveBeenCalledTimes(1);

    expect(auth.register).toHaveBeenCalledWith({
      firstName: 'Ada',
      lastName: 'Lovelace',
      username: 'ada',
      email: 'ada@example.com',
      password: 'password123',
      acceptedTerms: true,
    });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/group/setup');
  });

  it('does not submit twice while registration is pending', () => {
    fillValidForm();
    component.submitting.set(true);

    component.submit();

    expect(auth.register).not.toHaveBeenCalled();
  });

  it('shows the API conflict without guessing which field is taken', () => {
    // The API names neither field on purpose, so accounts cannot be enumerated.
    fillValidForm();
    auth.register.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: {
              message:
                "Ce nom d'utilisateur ou cette adresse e-mail est déjà utilisé.",
            },
          }),
      ),
    );

    component.submit();

    expect(component.submissionError()).toContain('Un compte utilise déjà');
  });

  it('maps offline, malformed, validation, and server failures', () => {
    fillValidForm();
    auth.register
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })))
      .mockReturnValueOnce(throwError(() => new Error('unexpected')))
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 400 })))
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })));

    component.submit();
    expect(component.submissionError()).toContain('Impossible de joindre');
    component.submit();
    expect(component.submissionError()).toContain('inattendue');
    component.submit();
    expect(component.submissionError()).toContain('informations sont invalides');
    component.submit();
    expect(component.submissionError()).toContain('création du compte a échoué');
  });

  it('asks the user to wait when the API rate limits registrations', () => {
    fillValidForm();
    auth.register.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 429 })));

    component.submit();

    expect(component.submissionError()).toContain('Trop de tentatives');
  });
});
