import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, map, of, shareReplay, tap } from 'rxjs';
import { API_BASE_URL } from '../http/api-base-url';
import { AuthStatus, AuthUser } from './auth.models';

/**
 * The signed-in user. Signing in happens on the Synapse identity service:
 * the API's /auth/login sends the browser there and opens Plano's session on
 * the way back, so this service only restores and ends that session.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = inject(API_BASE_URL);
  private readonly apiUrl = `${this.apiBase}/auth`;
  private readonly userState = signal<AuthUser | null>(null);
  private readonly statusState = signal<AuthStatus>('loading');
  private restoreRequest?: Observable<AuthUser | null>;

  readonly user = this.userState.asReadonly();
  readonly status = this.statusState.asReadonly();

  /** Where the browser goes to sign in, coming back to `returnUrl`. */
  signInUrl(returnUrl: string, language: string): string {
    const params = new URLSearchParams({ returnTo: returnUrl, lang: language });
    return `${this.apiUrl}/login?${params.toString()}`;
  }

  restoreSession(): Observable<AuthUser | null> {
    if (this.statusState() !== 'loading') {
      return of(this.userState());
    }

    if (!this.restoreRequest) {
      this.restoreRequest = this.http
        .get<AuthUser>(`${this.apiUrl}/session`)
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

  /** Accepts Plano's own terms, asked once on the welcome screen. */
  acceptTerms(): Observable<AuthUser> {
    return this.http
      .post<AuthUser>(`${this.apiBase}/users/me/terms`, null)
      .pipe(tap((user) => this.setAuthenticated(user)));
  }

  /**
   * Ends Plano's session and emits where to send the browser next: the
   * identity service, which signs out of every Synapse app.
   */
  logout(): Observable<string> {
    return this.http
      .post<{ redirectTo: string }>(`${this.apiUrl}/logout`, null)
      .pipe(
        tap(() => this.setAnonymous()),
        map(({ redirectTo }) => redirectTo),
      );
  }

  /** Applies a fresher copy of the signed-in user, e.g. after a profile change. */
  updateUser(user: AuthUser): void {
    if (this.userState()) this.userState.set(user);
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

