import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CreateGroupRequest,
  GroupDetails,
  JoinGroupRequest,
} from './group.models';

@Injectable({ providedIn: 'root' })
export class GroupsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/v1/groups';

  getMine(): Observable<GroupDetails | null> {
    return this.http.get<GroupDetails | null>(`${this.apiUrl}/me`, {
      withCredentials: true,
    });
  }

  create(details: CreateGroupRequest): Observable<GroupDetails> {
    return this.http.post<GroupDetails>(this.apiUrl, details, {
      withCredentials: true,
    });
  }

  join(details: JoinGroupRequest): Observable<GroupDetails> {
    return this.http.post<GroupDetails>(`${this.apiUrl}/join`, details, {
      withCredentials: true,
    });
  }

  update(name: string): Observable<GroupDetails> {
    return this.http.patch<GroupDetails>(
      `${this.apiUrl}/me`,
      { name },
      {
        withCredentials: true,
      },
    );
  }

  rotateInviteCode(): Observable<GroupDetails> {
    return this.http.post<GroupDetails>(`${this.apiUrl}/me/invite-code`, null, {
      withCredentials: true,
    });
  }

  transferOwnership(userId: string): Observable<GroupDetails> {
    return this.http.patch<GroupDetails>(
      `${this.apiUrl}/me/owner`,
      { userId },
      { withCredentials: true },
    );
  }

  removeMember(userId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/me/members/${userId}`, {
      withCredentials: true,
    });
  }

  leave(): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/me/leave`, null, {
      withCredentials: true,
    });
  }

  delete(): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/me`, {
      withCredentials: true,
    });
  }
}
