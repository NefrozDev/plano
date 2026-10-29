import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { UsernameAvailability } from '@plano/common';
import { Observable, map, tap } from 'rxjs';
import { AuthUser } from '../auth/auth.models';
import { AuthService } from '../auth/auth.service';
import { API_BASE_URL } from '../http/api-base-url';

/** The signed-in user's username and picture; every answer refreshes the user held by AuthService. */
@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly usersUrl = `${inject(API_BASE_URL)}/users`;
  private readonly apiUrl = `${this.usersUrl}/me/avatar`;

  /** Multipart upload of an already resized picture (see resizeAvatar). */
  uploadAvatar(picture: Blob): Observable<AuthUser> {
    const body = new FormData();
    body.append('avatar', picture, picture.type === 'image/png' ? 'avatar.png' : 'avatar.webp');
    return this.http.put<AuthUser>(this.apiUrl, body).pipe(tap((user) => this.auth.updateUser(user)));
  }

  /** Fails with HTTP 409 when someone else has the name. */
  changeUsername(username: string): Observable<AuthUser> {
    return this.http
      .patch<AuthUser>(`${this.usersUrl}/me`, { username })
      .pipe(tap((user) => this.auth.updateUser(user)));
  }

  /** The caller's own name counts as available. */
  isUsernameAvailable(username: string): Observable<boolean> {
    return this.http
      .get<UsernameAvailability>(`${this.usersUrl}/username-availability`, { params: { username } })
      .pipe(map(({ available }) => available));
  }

  removeAvatar(): Observable<AuthUser> {
    return this.http.delete<AuthUser>(this.apiUrl).pipe(tap((user) => this.auth.updateUser(user)));
  }
}
