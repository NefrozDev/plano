import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthUser } from '../../../core/auth/auth.models';
import { AuthService } from '../../../core/auth/auth.service';
import { LoginComponent } from './login.component';

describe('LoginComponent', () => {
  let auth: jasmine.SpyObj<AuthService>;
  let component: LoginComponent;
  let router: Router;

  const user: AuthUser = {
    id: 'user-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    username: 'ada',
    email: 'ada@example.com',
  };

  beforeEach(async () => {
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['login']);
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
      ],
    }).compileComponents();

    component = TestBed.createComponent(LoginComponent).componentInstance;
    router = TestBed.inject(Router);
  });

  it('marks empty fields as touched without calling the API', () => {
    component.submit();

    expect(component.form.controls.username.touched).toBeTrue();
    expect(component.form.controls.password.touched).toBeTrue();
    expect(auth.login).not.toHaveBeenCalled();
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
});
