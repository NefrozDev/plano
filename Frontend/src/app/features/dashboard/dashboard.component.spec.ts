import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthUser } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { DashboardComponent } from './dashboard.component';

describe('DashboardComponent', () => {
  let auth: jasmine.SpyObj<AuthService> & {
    user: ReturnType<typeof signal<AuthUser | null>>;
  };

  const user: AuthUser = {
    id: 'user-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    username: 'ada',
    email: 'ada@example.com',
  };

  beforeEach(async () => {
    auth = Object.assign(
      jasmine.createSpyObj<AuthService>('AuthService', ['logout']),
      { user: signal<AuthUser | null>(user) },
    );
    auth.logout.and.returnValue(of(void 0));

    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
      ],
    }).compileComponents();
  });

  it('renders the dashboard for the restored user', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('h1')?.textContent).toContain('Ada');
    expect(element.querySelector('.profile-button')?.textContent).toContain('AL');
    expect(element.querySelectorAll('.bottom-navigation button').length).toBe(4);
  });

  it('falls back to the username and then anonymous display values', () => {
    const component = TestBed.createComponent(
      DashboardComponent,
    ).componentInstance;
    auth.user.set({ ...user, firstName: '', lastName: '' });

    expect(component.displayName()).toBe('ada');
    expect(component.initials()).toBe('A');

    auth.user.set(null);
    expect(component.displayName()).toBe('vous');
    expect(component.initials()).toBe('P');
  });

  it('updates the active navigation item', () => {
    const component = TestBed.createComponent(
      DashboardComponent,
    ).componentInstance;

    component.selectNavigation('Progress');

    expect(component.activeNavigation).toBe('Progress');
  });

  it('logs out and returns to the login screen', () => {
    const component = TestBed.createComponent(
      DashboardComponent,
    ).componentInstance;
    const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(
      true,
    );

    component.logout();

    expect(auth.logout).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledOnceWith('/login');
  });

  it('ignores duplicate logout clicks and reports failures', () => {
    const component = TestBed.createComponent(
      DashboardComponent,
    ).componentInstance;
    component.logoutPending.set(true);

    component.logout();
    expect(auth.logout).not.toHaveBeenCalled();

    component.logoutPending.set(false);
    auth.logout.and.returnValue(throwError(() => new Error('offline')));
    component.logout();

    expect(component.logoutError()).toContain('déconnexion a échoué');
    expect(component.logoutPending()).toBeFalse();
  });
});
