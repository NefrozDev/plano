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
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
      ],
    }).compileComponents();

    component = TestBed.createComponent(RegisterComponent).componentInstance;
    router = TestBed.inject(Router);
  });

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
    expect(component.passwordConfirmationError()).toContain('correspondent pas');
    expect(auth.register).not.toHaveBeenCalled();
  });

  it('enforces the username format used by the backend', () => {
    component.form.controls.username.setValue('not allowed!');

    expect(component.form.controls.username.hasError('pattern')).toBeTrue();
  });

  it('submits only the backend contract and then navigates home', () => {
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
    expect(navigate).toHaveBeenCalledOnceWith('/');
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
});
