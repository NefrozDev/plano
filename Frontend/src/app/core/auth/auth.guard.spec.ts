import type { MockedObject } from 'vitest';
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
  let auth: MockedObject<Pick<AuthService, 'restoreSession'>>;
  let router: Router;

  const user: AuthUser = {
    id: 'user-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    username: 'ada',
    email: 'ada@example.com',
    locale: 'fr',
    avatarVersion: null,
  };

  beforeEach(() => {
    auth = {
      restoreSession: vi.fn().mockName('AuthService.restoreSession'),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
      ],
    });
    router = TestBed.inject(Router);
  });

  it('allows an authenticated user to open a protected route', async () => {
    auth.restoreSession.mockReturnValue(of(user));

    expect(await runGuard(authenticatedGuard, '/')).toBe(true);
    expect(auth.restoreSession).toHaveBeenCalledTimes(1);
  });

  it('redirects an anonymous user to login and preserves the return URL', async () => {
    auth.restoreSession.mockReturnValue(of(null));

    const result = await runGuard(authenticatedGuard, '/plan?week=2');

    expect(result instanceof UrlTree).toBe(true);
    expect(router.serializeUrl(result as UrlTree)).toBe('/login?returnUrl=%2Fplan%3Fweek%3D2');
    expect(auth.restoreSession).toHaveBeenCalledTimes(1);
  });

  it('allows an anonymous user to open a guest route', async () => {
    auth.restoreSession.mockReturnValue(of(null));

    expect(await runGuard(guestGuard, '/login')).toBe(true);
    expect(auth.restoreSession).toHaveBeenCalledTimes(1);
  });

  it('redirects an authenticated user away from guest routes', async () => {
    auth.restoreSession.mockReturnValue(of(user));

    const result = await runGuard(guestGuard, '/login');

    expect(result instanceof UrlTree).toBe(true);
    expect(router.serializeUrl(result as UrlTree)).toBe('/');
    expect(auth.restoreSession).toHaveBeenCalledTimes(1);
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
