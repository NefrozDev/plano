import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { Observable, firstValueFrom, of } from 'rxjs';
import { AuthUser } from './auth.models';
import { authenticatedGuard, guestGuard } from './auth.guard';
import { AuthService } from './auth.service';

describe('authentication guards', () => {
  let auth: jasmine.SpyObj<AuthService>;
  let router: Router;

  const user: AuthUser = {
    id: 'user-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    username: 'ada',
    email: 'ada@example.com',
  };

  beforeEach(() => {
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['restoreSession']);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
      ],
    });
    router = TestBed.inject(Router);
  });

  it('allows an authenticated user to open a protected route', async () => {
    auth.restoreSession.and.returnValue(of(user));

    expect(await runGuard(authenticatedGuard, '/')).toBeTrue();
  });

  it('redirects an anonymous user to login and preserves the return URL', async () => {
    auth.restoreSession.and.returnValue(of(null));

    const result = await runGuard(authenticatedGuard, '/plan?week=2');

    expect(result instanceof UrlTree).toBeTrue();
    expect(router.serializeUrl(result as UrlTree)).toBe(
      '/login?returnUrl=%2Fplan%3Fweek%3D2',
    );
  });

  it('allows an anonymous user to open a guest route', async () => {
    auth.restoreSession.and.returnValue(of(null));

    expect(await runGuard(guestGuard, '/login')).toBeTrue();
  });

  it('redirects an authenticated user away from guest routes', async () => {
    auth.restoreSession.and.returnValue(of(user));

    const result = await runGuard(guestGuard, '/login');

    expect(router.serializeUrl(result as UrlTree)).toBe('/');
  });

  function runGuard(
    guard: typeof authenticatedGuard,
    url: string,
  ): Promise<boolean | UrlTree> {
    const result = TestBed.runInInjectionContext(() =>
      guard(
        {} as ActivatedRouteSnapshot,
        { url } as RouterStateSnapshot,
      ),
    ) as Observable<boolean | UrlTree>;

    return firstValueFrom(result);
  }
});
