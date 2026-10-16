import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../http/api-base-url';
import {
  CreateGroupRequest,
  GroupDetails,
  JoinGroupRequest,
} from './group.models';

@Injectable({ providedIn: 'root' })
export class GroupsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${inject(API_BASE_URL)}/groups`;

  getMine(): Observable<GroupDetails | null> {
    return this.http.get<GroupDetails | null>(`${this.apiUrl}/me`);
  }

  create(details: CreateGroupRequest): Observable<GroupDetails> {
    return this.http.post<GroupDetails>(this.apiUrl, details);
  }

  join(details: JoinGroupRequest): Observable<GroupDetails> {
    return this.http.post<GroupDetails>(`${this.apiUrl}/join`, details);
  }

  update(name: string): Observable<GroupDetails> {
    return this.http.patch<GroupDetails>(`${this.apiUrl}/me`, { name });
  }

  rotateInviteCode(): Observable<GroupDetails> {
    return this.http.post<GroupDetails>(`${this.apiUrl}/me/invite-code`, null);
  }

  transferOwnership(userId: string): Observable<GroupDetails> {
    return this.http.patch<GroupDetails>(`${this.apiUrl}/me/owner`, { userId });
  }

  removeMember(userId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/me/members/${userId}`);
  }

  leave(): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/me/leave`, null);
  }

  delete(): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/me`);
  }
}
