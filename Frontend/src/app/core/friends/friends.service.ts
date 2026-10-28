import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  Contact,
  Friend,
  FriendRequests,
  SendFriendRequestRequest,
  SendFriendRequestResult,
  UserSearchResult,
} from '@plano/common';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../http/api-base-url';

/** The shortest username prefix the API searches for. */
export const MIN_SEARCH_LENGTH = 2;

@Injectable({ providedIn: 'root' })
export class FriendsService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = inject(API_BASE_URL);
  private readonly friendsUrl = `${this.apiBase}/friends`;

  list(): Observable<Friend[]> {
    return this.http.get<Friend[]>(this.friendsUrl);
  }

  requests(): Observable<FriendRequests> {
    return this.http.get<FriendRequests>(`${this.friendsUrl}/requests`);
  }

  search(query: string): Observable<UserSearchResult[]> {
    return this.http.get<UserSearchResult[]>(`${this.friendsUrl}/search`, {
      params: new HttpParams().set('q', query.trim()),
    });
  }

  sendRequest(userId: string): Observable<SendFriendRequestResult> {
    const details: SendFriendRequestRequest = { userId };
    return this.http.post<SendFriendRequestResult>(`${this.friendsUrl}/requests`, details);
  }

  accept(requestId: string): Observable<Friend> {
    return this.http.post<Friend>(`${this.friendsUrl}/requests/${requestId}/accept`, null);
  }

  /** Declines a received request or cancels a sent one. */
  removeRequest(requestId: string): Observable<void> {
    return this.http.delete<void>(`${this.friendsUrl}/requests/${requestId}`);
  }

  removeFriend(userId: string): Observable<void> {
    return this.http.delete<void>(`${this.friendsUrl}/${userId}`);
  }

  /** Friends and group mates: who can be invited to events and lists. */
  contacts(): Observable<Contact[]> {
    return this.http.get<Contact[]>(`${this.apiBase}/contacts`);
  }
}
