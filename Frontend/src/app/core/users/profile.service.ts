import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { AuthUser } from '../auth/auth.models';
import { AuthService } from '../auth/auth.service';
import { API_BASE_URL } from '../http/api-base-url';

/** The signed-in user's picture; every answer refreshes the user held by AuthService. */
@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly apiUrl = `${inject(API_BASE_URL)}/users/me/avatar`;

  /** Multipart upload of an already resized picture (see resizeAvatar). */
  uploadAvatar(picture: Blob): Observable<AuthUser> {
    const body = new FormData();
    body.append('avatar', picture, picture.type === 'image/png' ? 'avatar.png' : 'avatar.webp');
    return this.http.put<AuthUser>(this.apiUrl, body).pipe(tap((user) => this.auth.updateUser(user)));
  }

  removeAvatar(): Observable<AuthUser> {
    return this.http.delete<AuthUser>(this.apiUrl).pipe(tap((user) => this.auth.updateUser(user)));
  }
}
