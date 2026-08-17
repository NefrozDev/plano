import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, of, shareReplay, tap } from 'rxjs';
import {
  AuthStatus,
  AuthUser,
  LoginRequest,
  RegisterRequest,
} from './auth.models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/v1/auth';
  private readonly userState = signal<AuthUser | null>(null);
  private readonly statusState = signal<AuthStatus>('loading');
  private restoreRequest?: Observable<AuthUser | null>;

  readonly user = this.userState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly isAuthenticated = computed(
    () => this.statusState() === 'authenticated',
  );

  login(credentials: LoginRequest): Observable<AuthUser> {
    return this.http
      .post<AuthUser>(`${this.apiUrl}/login`, credentials, {
        withCredentials: true,
      })
      .pipe(tap((user) => this.setAuthenticated(user)));
  }

  register(details: RegisterRequest): Observable<AuthUser> {
    return this.http
      .post<AuthUser>(`${this.apiUrl}/register`, details, {
        withCredentials: true,
      })
      .pipe(tap((user) => this.setAuthenticated(user)));
  }

  restoreSession(): Observable<AuthUser | null> {
    if (this.statusState() !== 'loading') {
      return of(this.userState());
    }

    if (!this.restoreRequest) {
      this.restoreRequest = this.http
        .get<AuthUser>(`${this.apiUrl}/session`, { withCredentials: true })
        .pipe(
          tap((user) => this.setAuthenticated(user)),
          catchError(() => {
            this.setAnonymous();
            return of(null);
          }),
          finalize(() => {
            this.restoreRequest = undefined;
          }),
          shareReplay({ bufferSize: 1, refCount: false }),
        );
    }

    return this.restoreRequest;
  }

  logout(): Observable<void> {
    return this.http
      .post<void>(`${this.apiUrl}/logout`, null, { withCredentials: true })
      .pipe(tap(() => this.setAnonymous()));
  }

  private setAuthenticated(user: AuthUser): void {
    this.userState.set(user);
    this.statusState.set('authenticated');
  }

  private setAnonymous(): void {
    this.userState.set(null);
    this.statusState.set('anonymous');
  }
}
