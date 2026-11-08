import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthUser } from './auth.models';
import { apiCredentialsInterceptor } from '../http/api-credentials.interceptor';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  const user: AuthUser = {
    id: 'user-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    username: 'ada',
    email: 'ada@example.com',
    locale: 'fr',
    avatarVersion: null,
    termsAccepted: true,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        // Credentials are added by the interceptor, as in the real app config.
        provideHttpClient(withInterceptors([apiCredentialsInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('builds the sign-in address with where to come back and the language', () => {
    expect(service.signInUrl('/lists?tab=mine', 'en')).toBe(
      '/api/v1/auth/login?returnTo=%2Flists%3Ftab%3Dmine&lang=en',
    );
    http.expectNone(() => true);
  });

  it('deduplicates concurrent session restoration and reuses its result', () => {
    const restored: Array<AuthUser | null> = [];

    service.restoreSession().subscribe((value) => restored.push(value));
    service.restoreSession().subscribe((value) => restored.push(value));

    const request = http.expectOne('/api/v1/auth/session');
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBe(true);
    request.flush(user);

    service.restoreSession().subscribe((value) => restored.push(value));
    http.expectNone('/api/v1/auth/session');
    expect(restored).toEqual([user, user, user]);
  });

  it('settles as anonymous when no persistent session exists', () => {
    let restored: AuthUser | null | undefined;

    service.restoreSession().subscribe((value) => (restored = value));
    const request = http.expectOne('/api/v1/auth/session');
    request.flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(restored).toBeNull();
    expect(service.user()).toBeNull();
    expect(service.status()).toBe('anonymous');
  });

  it('replaces the signed-in user with a fresher copy, never signs anyone in', () => {
    service.updateUser({ ...user, locale: 'de' });
    expect(service.user()).toBeNull();

    service.restoreSession().subscribe();
    http.expectOne('/api/v1/auth/session').flush(user);
    service.updateUser({ ...user, locale: 'de', avatarVersion: 7 });

    expect(service.user()).toEqual({ ...user, locale: 'de', avatarVersion: 7 });
    expect(service.status()).toBe('authenticated');
  });

  it('ends the session and gives the identity service address to sign out everywhere', () => {
    service.restoreSession().subscribe();
    http.expectOne('/api/v1/auth/session').flush(user);
    let next: string | undefined;

    service.logout().subscribe((redirectTo) => (next = redirectTo));
    const request = http.expectOne('/api/v1/auth/logout');
    expect(request.request.method).toBe('POST');
    request.flush({ redirectTo: 'https://auth.example/oidc/session/end?client_id=plano' });

    expect(next).toBe('https://auth.example/oidc/session/end?client_id=plano');
    expect(service.user()).toBeNull();
    expect(service.status()).toBe('anonymous');
  });

  it("accepts Plano's terms and keeps the updated user", () => {
    service.restoreSession().subscribe();
    http.expectOne('/api/v1/auth/session').flush({ ...user, termsAccepted: false });

    service.acceptTerms().subscribe();
    const request = http.expectOne('/api/v1/users/me/terms');
    expect(request.request.method).toBe('POST');
    request.flush(user);

    expect(service.user()?.termsAccepted).toBe(true);
  });
});
