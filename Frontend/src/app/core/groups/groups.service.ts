import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { CreateGroupRequest, GroupSummary } from './group.models';

@Injectable({ providedIn: 'root' })
export class GroupsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/v1/groups';

  getMine(): Observable<GroupSummary | null> {
    return this.http.get<GroupSummary | null>(`${this.apiUrl}/me`, {
      withCredentials: true,
    });
  }

  create(details: CreateGroupRequest): Observable<GroupSummary> {
    return this.http.post<GroupSummary>(this.apiUrl, details, {
      withCredentials: true,
    });
  }
}
