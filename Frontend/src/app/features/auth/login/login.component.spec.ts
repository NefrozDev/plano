import type { MockedObject } from 'vitest';
import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthUser } from '../../../core/auth/auth.models';
import { AuthService } from '../../../core/auth/auth.service';
import { LoginComponent } from './login.component';

describe('LoginComponent', () => {
  let auth: MockedObject<Pick<AuthService, 'login'>>;
  let component: LoginComponent;
  let router: Router;
  let returnUrl: string | null;

  const user: AuthUser = {
    id: 'user-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    username: 'ada',
    email: 'ada@example.com',
    locale: 'fr',
    avatarVersion: null,
  };

  beforeEach(async () => {
    returnUrl = null;
    auth = {
      login: vi.fn().mockName('AuthService.login'),
    };
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

    expect(component.form.controls.username.touched).toBe(true);
    expect(component.form.controls.password.touched).toBe(true);
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('exposes required and maximum-length field errors', () => {
    component.form.controls.username.markAsTouched();
    expect(component.showError('username')).toBe(true);
    expect(component.fieldError('username')).toContain('Saisissez');
    expect(component.fieldError('password')).toContain('Saisissez');

    component.form.controls.username.setValue('a'.repeat(31));
    component.form.controls.password.setValue('p'.repeat(129));
    expect(component.fieldError('username')).toContain('30 caractères');
    expect(component.fieldError('password')).toContain('128 caractères');
  });

  it('links to password recovery', () => {
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();

    const link = (fixture.nativeElement as HTMLElement).querySelector('.forgot-password') as HTMLAnchorElement;
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/forgot-password');
    expect(link.textContent).toContain('Mot de passe oublié');
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('submits trimmed username, keeps the password intact, and navigates', () => {
    auth.login.mockReturnValue(of(user));
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    component.form.setValue({ username: '  ada  ', password: ' pass word ' });

    component.submit();

    expect(auth.login).toHaveBeenCalledTimes(1);

    expect(auth.login).toHaveBeenCalledWith({
      username: 'ada',
      password: ' pass word ',
    });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/');
    expect(component.submitting()).toBe(false);
  });

  it('accepts a local return URL and rejects a protocol-relative one', () => {
    auth.login.mockReturnValue(of(user));
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    fillValidForm();
    returnUrl = '/plan?week=2';

    component.submit();
    expect(navigate).toHaveBeenCalledWith('/plan?week=2');

    returnUrl = '//attacker.example';
    component.submit();
    expect(navigate).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenLastCalledWith('/');
  });

  it('does not submit twice while a request is pending', () => {
    fillValidForm();
    component.submitting.set(true);

    component.submit();

    expect(auth.login).not.toHaveBeenCalled();
  });

  it('shows a useful message for rejected credentials', () => {
    const navigate = vi.spyOn(router, 'navigateByUrl');
    auth.login.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 401, statusText: 'Unauthorized' })),
    );
    component.form.setValue({ username: 'ada', password: 'wrong-pass' });

    component.submit();

    expect(auth.login).toHaveBeenCalledTimes(1);
    expect(auth.login).toHaveBeenCalledWith({ username: 'ada', password: 'wrong-pass' });
    expect(component.submissionError()).toContain('incorrect');
    expect(component.submitting()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('maps offline, unexpected, and server failures', () => {
    const navigate = vi.spyOn(router, 'navigateByUrl');
    fillValidForm();
    auth.login
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })))
      .mockReturnValueOnce(throwError(() => new Error('unexpected')))
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 503 })));

    component.submit();
    expect(component.submissionError()).toContain('Impossible de joindre');
    component.submit();
    expect(component.submissionError()).toContain('inattendue');
    component.submit();
    expect(component.submissionError()).toContain('connexion a échoué');
    expect(auth.login).toHaveBeenCalledTimes(3);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('asks the user to wait when the API rate limits login attempts', () => {
    const navigate = vi.spyOn(router, 'navigateByUrl');
    fillValidForm();
    auth.login.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 429 })));

    component.submit();

    expect(auth.login).toHaveBeenCalledTimes(1);
    expect(component.submissionError()).toContain('Trop de tentatives');
    expect(component.submitting()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });
});
