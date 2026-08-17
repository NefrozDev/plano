import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthUser } from './auth.models';
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
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('logs in with credentials and stores the returned user in memory', () => {
    const credentials = { username: 'ada', password: 'correct horse' };
    let result: AuthUser | undefined;

    service.login(credentials).subscribe((value) => (result = value));

    const request = http.expectOne('/api/v1/auth/login');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(credentials);
    expect(request.request.withCredentials).toBeTrue();
    request.flush(user);

    expect(result).toEqual(user);
    expect(service.user()).toEqual(user);
    expect(service.status()).toBe('authenticated');
  });

  it('registers with the exact API payload and authenticates the user', () => {
    const details = {
      firstName: 'Ada',
      lastName: 'Lovelace',
      username: 'ada',
      email: 'ada@example.com',
      password: 'password123',
      acceptedTerms: true,
    };

    service.register(details).subscribe();

    const request = http.expectOne('/api/v1/auth/register');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(details);
    expect(request.request.withCredentials).toBeTrue();
    request.flush(user);

    expect(service.user()).toEqual(user);
  });

  it('deduplicates concurrent session restoration and reuses its result', () => {
    const restored: Array<AuthUser | null> = [];

    service.restoreSession().subscribe((value) => restored.push(value));
    service.restoreSession().subscribe((value) => restored.push(value));

    const request = http.expectOne('/api/v1/auth/session');
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBeTrue();
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

  it('clears its in-memory session after a successful logout', () => {
    service.login({ username: 'ada', password: 'password123' }).subscribe();
    http.expectOne('/api/v1/auth/login').flush(user);

    service.logout().subscribe();
    const request = http.expectOne('/api/v1/auth/logout');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeNull();
    expect(request.request.withCredentials).toBeTrue();
    request.flush(null);

    expect(service.user()).toBeNull();
    expect(service.status()).toBe('anonymous');
  });
});
