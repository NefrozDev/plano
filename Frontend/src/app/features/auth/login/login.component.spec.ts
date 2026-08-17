import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthUser } from '../../../core/auth/auth.models';
import { AuthService } from '../../../core/auth/auth.service';
import { LoginComponent } from './login.component';

describe('LoginComponent', () => {
  let auth: jasmine.SpyObj<AuthService>;
  let component: LoginComponent;
  let router: Router;
  let returnUrl: string | null;

  const user: AuthUser = {
    id: 'user-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    username: 'ada',
    email: 'ada@example.com',
  };

  beforeEach(async () => {
    returnUrl = null;
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['login']);
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: { get: () => returnUrl },
            },
          },
        },
      ],
    }).compileComponents();

    component = TestBed.createComponent(LoginComponent).componentInstance;
    router = TestBed.inject(Router);
  });

  function fillValidForm(): void {
    component.form.setValue({ username: 'ada', password: 'password123' });
  }

  it('marks empty fields as touched without calling the API', () => {
    component.submit();

    expect(component.form.controls.username.touched).toBeTrue();
    expect(component.form.controls.password.touched).toBeTrue();
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('exposes required and maximum-length field errors', () => {
    component.form.controls.username.markAsTouched();
    expect(component.showError('username')).toBeTrue();
    expect(component.fieldError('username')).toContain('Saisissez');
    expect(component.fieldError('password')).toContain('Saisissez');

    component.form.controls.username.setValue('a'.repeat(31));
    component.form.controls.password.setValue('p'.repeat(129));
    expect(component.fieldError('username')).toContain('30 caractères');
    expect(component.fieldError('password')).toContain('128 caractères');
  });

  it('shows password recovery information', () => {
    component.showRecoveryInfo();

    expect(component.recoveryMessage).toContain('prochainement disponible');
  });

  it('submits trimmed username, keeps the password intact, and navigates', () => {
    auth.login.and.returnValue(of(user));
    const navigate = spyOn(router, 'navigateByUrl').and.resolveTo(true);
    component.form.setValue({ username: '  ada  ', password: ' pass word ' });

    component.submit();

    expect(auth.login).toHaveBeenCalledOnceWith({
      username: 'ada',
      password: ' pass word ',
    });
    expect(navigate).toHaveBeenCalledOnceWith('/');
    expect(component.submitting).toBeFalse();
  });

  it('accepts a local return URL and rejects a protocol-relative one', () => {
    auth.login.and.returnValue(of(user));
    const navigate = spyOn(router, 'navigateByUrl').and.resolveTo(true);
    fillValidForm();
    returnUrl = '/plan?week=2';

    component.submit();
    expect(navigate).toHaveBeenCalledWith('/plan?week=2');

    returnUrl = '//attacker.example';
    component.submit();
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('does not submit twice while a request is pending', () => {
    fillValidForm();
    component.submitting = true;

    component.submit();

    expect(auth.login).not.toHaveBeenCalled();
  });

  it('shows a useful message for rejected credentials', () => {
    auth.login.and.returnValue(
      throwError(
        () => new HttpErrorResponse({ status: 401, statusText: 'Unauthorized' }),
      ),
    );
    component.form.setValue({ username: 'ada', password: 'wrong-pass' });

    component.submit();

    expect(component.submissionError).toContain('incorrect');
    expect(component.submitting).toBeFalse();
  });

  it('maps offline, unexpected, and server failures', () => {
    fillValidForm();
    auth.login.and.returnValues(
      throwError(() => new HttpErrorResponse({ status: 0 })),
      throwError(() => new Error('unexpected')),
      throwError(() => new HttpErrorResponse({ status: 503 })),
    );

    component.submit();
    expect(component.submissionError).toContain('Impossible de joindre');
    component.submit();
    expect(component.submissionError).toContain('inattendue');
    component.submit();
    expect(component.submissionError).toContain('connexion a échoué');
  });
});
