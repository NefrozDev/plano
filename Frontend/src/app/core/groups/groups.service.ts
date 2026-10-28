import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../http/api-base-url';
import {
  CreateGroupRequest,
  GroupDetails,
  JoinGroupRequest,
} from './group.models';

/** A user can belong to several groups: every action but create and join targets one by id. */
@Injectable({ providedIn: 'root' })
export class GroupsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${inject(API_BASE_URL)}/groups`;

  getAll(): Observable<GroupDetails[]> {
    return this.http.get<GroupDetails[]>(this.apiUrl);
  }

  get(groupId: string): Observable<GroupDetails> {
    return this.http.get<GroupDetails>(`${this.apiUrl}/${groupId}`);
  }

  create(details: CreateGroupRequest): Observable<GroupDetails> {
    return this.http.post<GroupDetails>(this.apiUrl, details);
  }

  join(details: JoinGroupRequest): Observable<GroupDetails> {
    return this.http.post<GroupDetails>(`${this.apiUrl}/join`, details);
  }

  update(groupId: string, name: string): Observable<GroupDetails> {
    return this.http.patch<GroupDetails>(`${this.apiUrl}/${groupId}`, { name });
  }

  rotateInviteCode(groupId: string): Observable<GroupDetails> {
    return this.http.post<GroupDetails>(`${this.apiUrl}/${groupId}/invite-code`, null);
  }

  transferOwnership(groupId: string, userId: string): Observable<GroupDetails> {
    return this.http.patch<GroupDetails>(`${this.apiUrl}/${groupId}/owner`, { userId });
  }

  removeMember(groupId: string, userId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${groupId}/members/${userId}`);
  }

  leave(groupId: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/${groupId}/leave`, null);
  }

  delete(groupId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${groupId}`);
  }
}
